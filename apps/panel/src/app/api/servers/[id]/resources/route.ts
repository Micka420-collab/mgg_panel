import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertNotSuspended } from "@/lib/access";
import { DaemonClient, type NodeLike } from "@/lib/daemon";
import { buildServerSpec } from "@/lib/spec";
import { audit } from "@/lib/audit";

/** Keep this much RAM for the host itself — mirrors the daemon's start-time guard. */
const RESERVE_MB = Number(process.env.NODE_MEMORY_RESERVE_MB ?? 512);
const MIN_MEMORY_MB = 256;
const STEP_MB = 256;
/** Absolute fallback ceiling when the host capacity can't be read. */
const FALLBACK_MAX_MB = 131072; // 128 GB
const FALLBACK_MAX_CPU = 3200; // 32 cores

interface HostInfo {
  totalMb: number;
  availableMb: number;
  runningMb: number;
  cpus: number;
}

async function readHost(node: NodeLike): Promise<HostInfo | null> {
  try {
    const sys = await new DaemonClient(node).system();
    if (!sys?.memTotal) return null;
    return {
      totalMb: Math.round(sys.memTotal / 1048576),
      availableMb: Math.round((sys.memAvailable ?? sys.memFree ?? 0) / 1048576),
      runningMb: Math.round(sys.runningMemMb ?? 0),
      cpus: Number(sys.cpus ?? 0),
    };
  } catch {
    return null;
  }
}

/** Live RAM management view: this server's limits, its live usage, and host capacity. */
export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);

  const host = await readHost(c.node);

  // Live usage of THIS server (best-effort; null if the node/server is offline).
  let usage: { memoryBytes: number; memoryLimitBytes: number; cpuPercentOfLimit: number } | null = null;
  let liveState: string = c.server.state;
  try {
    const status = await new DaemonClient(c.node).status(c.server.id);
    liveState = (status?.state as string) ?? liveState;
    if (status?.stats) {
      usage = {
        memoryBytes: status.stats.memoryBytes,
        memoryLimitBytes: status.stats.memoryLimitBytes,
        cpuPercentOfLimit: status.stats.cpuPercentOfLimit,
      };
    }
  } catch {
    /* node unreachable -> no live usage */
  }

  // Allocation breakdown across every server on the same node (capacity planning).
  // Names are only revealed for servers the user owns/administers; others are masked.
  const isAdmin = user.role === "ADMIN";
  const nodeServers = await db.server.findMany({
    where: { nodeId: c.node.id },
    select: { id: true, name: true, memoryMb: true, state: true, ownerId: true },
    orderBy: { memoryMb: "desc" },
  });
  const runningStates = new Set(["running", "starting"]);
  const committedMb = nodeServers.reduce((sum, s) => sum + s.memoryMb, 0);
  const servers = nodeServers.map((s) => {
    const mine = isAdmin || s.ownerId === user.id;
    return {
      id: s.id,
      name: mine ? s.name : "Autre serveur",
      memoryMb: s.memoryMb,
      running: runningStates.has(s.state),
      self: s.id === c.server.id,
    };
  });

  const maxMb = host ? Math.max(MIN_MEMORY_MB, host.totalMb - RESERVE_MB) : FALLBACK_MAX_MB;

  return json({
    server: {
      id: c.server.id,
      name: c.server.name,
      memoryMb: c.server.memoryMb,
      cpuPercent: c.server.cpuPercent,
      diskMb: c.server.diskMb,
      state: liveState,
    },
    usage,
    host, // { totalMb, availableMb, runningMb, cpus } | null
    allocation: { committedMb, servers },
    bounds: {
      minMb: MIN_MEMORY_MB,
      maxMb,
      stepMb: STEP_MB,
      reserveMb: RESERVE_MB,
      maxCpuPercent: host?.cpus ? host.cpus * 100 : FALLBACK_MAX_CPU,
    },
    canEdit: c.isOwner,
  });
});

const patchSchema = z
  .object({
    memoryMb: z.number().int().min(MIN_MEMORY_MB).max(FALLBACK_MAX_MB).optional(),
    cpuPercent: z.number().int().min(25).max(FALLBACK_MAX_CPU).optional(),
  })
  .refine((b) => b.memoryMb !== undefined || b.cpuPercent !== undefined, {
    message: "Nothing to update",
  });

/** Change the server's RAM (and optionally CPU). Applies on the next (re)start. */
export const PATCH = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  // Resource changes are owner/admin-only — they affect host capacity for everyone.
  if (!c.isOwner) throw new HttpError(403, "Only the owner can change resources");
  assertNotSuspended(c);

  const body = patchSchema.parse(await req.json());
  const host = await readHost(c.node);

  const data: Record<string, unknown> = {};

  if (body.memoryMb !== undefined) {
    // A single server can never be allocated more RAM than the host physically has
    // (minus the host reserve). Over-commit ACROSS servers is fine — stopped servers
    // free their RAM, and the daemon refuses to START a server that won't fit.
    if (host) {
      const ceil = Math.max(MIN_MEMORY_MB, host.totalMb - RESERVE_MB);
      if (body.memoryMb > ceil) {
        throw new HttpError(
          422,
          `Trop de RAM : l'hôte a ${Math.round(host.totalMb / 1024 * 10) / 10} Go au total (réserve ${RESERVE_MB} Mo). Maximum allouable à un serveur : ${(ceil / 1024).toFixed(1)} Go.`,
        );
      }
    }
    data.memoryMb = body.memoryMb;
  }

  if (body.cpuPercent !== undefined) {
    if (host?.cpus) {
      const ceil = host.cpus * 100;
      if (body.cpuPercent > ceil)
        throw new HttpError(422, `Trop de CPU : l'hôte a ${host.cpus} cœurs (max ${ceil}%).`);
    }
    data.cpuPercent = body.cpuPercent;
  }

  const updated = await db.server.update({
    where: { id: c.server.id },
    data,
    include: { allocations: true },
  });

  // Persist the new spec on the node WITHOUT recreating the container now: the new
  // limits apply on the next (re)start (the daemon detects the spec change and
  // rebuilds the container then) — so saving never kills a running server abruptly.
  let nodeOk = true;
  try {
    await new DaemonClient(c.node).registerServer(buildServerSpec(updated, updated.allocations), false);
  } catch {
    nodeOk = false;
  }

  await audit("server.resources", {
    userId: user.id,
    serverId: c.server.id,
    metadata: { memoryMb: data.memoryMb, cpuPercent: data.cpuPercent, nodeOk },
  });

  const runningStates = new Set(["running", "starting"]);
  return json({
    ok: true,
    nodeOk,
    restartNeeded: true,
    running: runningStates.has(updated.state),
    memoryMb: updated.memoryMb,
    cpuPercent: updated.cpuPercent,
  });
});
