import "server-only";
import { db } from "./db";
import { DaemonClient } from "./daemon";

/**
 * How long sampled points are retained. Older rows are pruned on every pass so
 * the table stays bounded regardless of fleet size.
 */
const RETENTION_DAYS = 7;

/** Cap the number of servers polled per pass so a large fleet can't stall the tick. */
const MAX_SERVERS_PER_PASS = 200;

/**
 * Last cumulative network counters per server, used to turn the daemon's
 * monotonically-increasing rx/tx byte totals into per-interval throughput.
 * In-process state is fine: it only ever makes the *first* sample after a panel
 * restart read 0 kbit/s, which self-corrects on the next tick.
 */
const lastNet = new Map<string, { rx: number; tx: number; ts: number }>();
/** Drop counters we haven't seen in a while so the map can't grow unbounded. */
const NET_STALE_MS = 30 * 60 * 1000;

function throughputKbps(prevBytes: number, curBytes: number, dtSec: number): number {
  if (dtSec <= 0) return 0;
  const delta = curBytes - prevBytes;
  if (delta < 0) return 0; // counter reset (container restart) — skip this interval
  return Math.max(0, Math.round((delta * 8) / 1000 / dtSec));
}

/** Coerce the daemon's loosely-typed player payload into an online count. */
function readPlayerCount(stats: { players?: { online?: number } } | null, players: unknown): number {
  if (stats?.players && typeof stats.players.online === "number") return stats.players.online;
  if (players && typeof players === "object" && "online" in (players as Record<string, unknown>)) {
    const n = (players as { online?: unknown }).online;
    if (typeof n === "number" && Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return 0;
}

/**
 * Sample live resource usage for every RUNNING server and persist one
 * {@link ServerStat} row each, then prune anything older than the retention
 * window. Designed to be called once per scheduler tick; failures for a single
 * server (node hiccup, transient daemon error) are swallowed so one bad node
 * never blocks metrics for the rest of the fleet.
 */
export async function recordStats(): Promise<void> {
  const servers = await db.server.findMany({
    where: { state: "running", suspended: false },
    include: { node: true },
    take: MAX_SERVERS_PER_PASS,
  });

  const now = new Date();
  const nowMs = now.getTime();
  const rows: {
    serverId: string;
    ts: Date;
    cpu: number;
    memMb: number;
    players: number;
    diskMb: number;
    netRxKbps: number;
    netTxKbps: number;
  }[] = [];

  // Poll nodes concurrently; the daemon status call is the slow part.
  await Promise.all(
    servers.map(async (s) => {
      try {
        const { stats, players } = await new DaemonClient(s.node).status(s.id);
        if (!stats) return; // not actually reporting (e.g. just-started); skip this tick
        const cpu = Number.isFinite(stats.cpuPercentOfLimit) ? Math.max(0, stats.cpuPercentOfLimit) : 0;
        const memMb = Math.max(0, Math.round((stats.memoryBytes ?? 0) / (1024 * 1024)));
        const diskMb = Math.max(0, Math.round((stats.diskBytes ?? 0) / (1024 * 1024)));

        // Turn the cumulative rx/tx byte counters into per-interval throughput.
        const rxBytes = Math.max(0, stats.networkRxBytes ?? 0);
        const txBytes = Math.max(0, stats.networkTxBytes ?? 0);
        const prev = lastNet.get(s.id);
        let netRxKbps = 0;
        let netTxKbps = 0;
        if (prev) {
          const dt = (nowMs - prev.ts) / 1000;
          netRxKbps = throughputKbps(prev.rx, rxBytes, dt);
          netTxKbps = throughputKbps(prev.tx, txBytes, dt);
        }
        lastNet.set(s.id, { rx: rxBytes, tx: txBytes, ts: nowMs });

        rows.push({ serverId: s.id, ts: now, cpu, memMb, players: readPlayerCount(stats, players), diskMb, netRxKbps, netTxKbps });
      } catch {
        /* node/daemon unreachable this tick — drop the sample */
      }
    }),
  );

  if (rows.length > 0) {
    await db.serverStat.createMany({ data: rows });
  }

  // Forget network counters for servers that have gone quiet, so the map stays bounded.
  for (const [id, v] of lastNet) if (nowMs - v.ts > NET_STALE_MS) lastNet.delete(id);

  // Prune outside the per-server loop so it runs even when no sample was taken.
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.serverStat.deleteMany({ where: { ts: { lt: cutoff } } });
}
