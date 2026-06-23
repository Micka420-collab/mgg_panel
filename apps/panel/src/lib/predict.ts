import "server-only";
import { db } from "./db";
import { raise, resolve } from "./monitor";
import { emitWebhook } from "./webhooks";

/**
 * Predictive crash / OOM early-warning.
 *
 * We already persist a {@link ServerStat} row per running server every minute
 * (see metrics.ts). This module reads the recent tail of those rows and spots
 * the classic *pre-crash* signatures BEFORE the server actually dies:
 *
 *  - memory creeping toward the container's cgroup cap (`Server.memoryMb`) that
 *    GC can't reclaim — the exact condition that triggers an OOM-kill, and
 *  - sustained CPU saturation (pegged at its limit) that shows up as lag.
 *
 * It's pure threshold + linear-trend math over Postgres rows — no ML — surfaced
 * as a forward-looking advisory ("likely to crash in ~15 min, add RAM or
 * restart") through the same deduped alert + Discord pipeline the monitor uses,
 * so it ships advisory-only with zero blast radius.
 */

// ─────────────────────────── tuning ───────────────────────────
/** How far back we look for the trend window. */
const WINDOW_MIN = 15;
/** Need at least this many samples before we trust a trend. */
const MIN_POINTS = 5;
/** …spanning at least this many minutes, so a brief load spike can't trigger. */
const MIN_SPAN_MIN = 8;

/** Memory used/cap ratio that counts as "high" for the recent tail. */
const MEM_HIGH = 0.9;
/** Drop below this to clear the alert (hysteresis — avoids flapping). */
const MEM_CLEAR = 0.85;
/** Pinned this close to the cap is alert-worthy even without an upward slope. */
const MEM_PINNED = 0.96;
/** How many trailing samples must agree before we call it sustained. */
const MEM_RECENT_N = 4;
/** Only alert on a climbing trend if the projected OOM is within this horizon. */
const ETA_ALERT_MIN = 45;
/** Ignore slopes flatter than this (MB/min) as noise. */
const MEM_MIN_SLOPE = 0.5;

/** CPU (% of the server's limit) that counts as saturated. */
const CPU_HIGH = 95;
/** Drop below this to clear the CPU alert. */
const CPU_CLEAR = 85;
/** Trailing samples that must all be saturated. */
const CPU_RECENT_N = 5;

// ─────────────────────────── pure assessment ───────────────────────────
export interface HealthPoint {
  /** epoch ms */
  ts: number;
  /** CPU as a percentage of the server's limit (0-100) */
  cpu: number;
  /** memory used, MB */
  memMb: number;
}

export type AlertLevel = "info" | "warning" | "critical";

export interface MemorySignal {
  risk: boolean;
  level: AlertLevel;
  message: string;
  /** latest used/cap ratio, 0-1 */
  ratio: number;
  /** projected minutes until the cap is hit, if climbing */
  etaMinutes: number | null;
}

export interface CpuSignal {
  risk: boolean;
  level: AlertLevel;
  message: string;
  /** latest CPU % of limit */
  latest: number;
}

export interface HealthAssessment {
  memory: MemorySignal | null;
  cpu: CpuSignal | null;
}

function fmtMem(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** Least-squares slope of y over x (returns 0 if undefined). */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    num += dx * (ys[i]! - my);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

function assessMemory(points: HealthPoint[], capMb: number, name: string): MemorySignal | null {
  if (capMb <= 0 || points.length < MIN_POINTS) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const spanMin = (last.ts - first.ts) / 60_000;
  if (spanMin < MIN_SPAN_MIN) return null;

  const ratio = last.memMb / capMb;
  const recent = points.slice(-MEM_RECENT_N);
  const sustainedHigh = recent.length >= MEM_RECENT_N && recent.every((p) => p.memMb / capMb >= MEM_HIGH);

  // MB/min trend over the window.
  const xs = points.map((p) => (p.ts - first.ts) / 60_000);
  const ys = points.map((p) => p.memMb);
  const mbPerMin = slope(xs, ys);

  const used = fmtMem(last.memMb);
  const cap = fmtMem(capMb);

  if (sustainedHigh && mbPerMin > MEM_MIN_SLOPE) {
    const remaining = capMb - last.memMb;
    const etaRaw = remaining > 0 ? remaining / mbPerMin : 0;
    const etaMinutes = Math.max(1, Math.round(etaRaw / 5) * 5);
    if (etaRaw <= ETA_ALERT_MIN) {
      return {
        risk: true,
        level: "warning",
        message: `Server "${name}" is near its RAM limit (${used}/${cap}) and still climbing — likely to crash in ~${etaMinutes} min. Add RAM or restart.`,
        ratio,
        etaMinutes,
      };
    }
  }

  if (sustainedHigh && ratio >= MEM_PINNED) {
    return {
      risk: true,
      level: "warning",
      message: `Server "${name}" has been pinned at its RAM limit (${used}/${cap}) for several minutes — likely to crash. Add RAM or restart.`,
      ratio,
      etaMinutes: null,
    };
  }

  return { risk: false, level: "info", message: "", ratio, etaMinutes: null };
}

function assessCpu(points: HealthPoint[], name: string): CpuSignal | null {
  if (points.length < MIN_POINTS) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if ((last.ts - first.ts) / 60_000 < MIN_SPAN_MIN) return null;

  const recent = points.slice(-CPU_RECENT_N);
  const saturated = recent.length >= CPU_RECENT_N && recent.every((p) => p.cpu >= CPU_HIGH);
  if (saturated) {
    return {
      risk: true,
      level: "info",
      message: `Server "${name}" has been CPU-saturated (~100% of its limit) for several minutes — players may be lagging. Consider raising its CPU.`,
      latest: last.cpu,
    };
  }
  return { risk: false, level: "info", message: "", latest: last.cpu };
}

/**
 * Pure health assessment over a recent series of samples. Exported so the
 * metrics API can compute a live badge without a second DB round-trip.
 */
export function assessHealth(points: HealthPoint[], capMb: number, name = "this server"): HealthAssessment {
  return { memory: assessMemory(points, capMb, name), cpu: assessCpu(points, name) };
}

// thresholds the orchestrator needs for hysteresis on clear
export { MEM_CLEAR, CPU_CLEAR, WINDOW_MIN };

// ─────────────────────────── orchestrator ───────────────────────────
/**
 * One predictive pass over every running server. Raises a forward-looking
 * advisory alert when a pre-crash signature appears and clears it (with
 * hysteresis) when the pressure subsides. Called from the scheduler tick after
 * fresh samples have been written.
 */
export async function detectResourcePressure(): Promise<void> {
  const servers = await db.server.findMany({
    where: { state: "running", suspended: false },
    select: { id: true, name: true, memoryMb: true, ownerId: true },
    take: 200,
  });
  if (servers.length === 0) return;

  const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000);

  for (const s of servers) {
    const rows = await db.serverStat.findMany({
      where: { serverId: s.id, ts: { gte: since } },
      orderBy: { ts: "asc" },
      select: { ts: true, cpu: true, memMb: true },
      take: 60,
    });
    const points: HealthPoint[] = rows.map((r) => ({ ts: r.ts.getTime(), cpu: r.cpu, memMb: r.memMb }));
    const health = assessHealth(points, s.memoryMb, s.name);

    // Memory pressure
    const memKey = `server.mem-pressure:${s.id}`;
    if (health.memory?.risk) {
      const isNew = await raise(memKey, health.memory.level, health.memory.message, { serverId: s.id });
      if (isNew) {
        await emitWebhook(
          "server.warning",
          {
            serverId: s.id,
            name: s.name,
            kind: "memory",
            ratio: Number(health.memory.ratio.toFixed(2)),
            etaMinutes: health.memory.etaMinutes,
          },
          { serverId: s.id, ownerId: s.ownerId },
        );
      }
    } else if (!health.memory || health.memory.ratio < MEM_CLEAR) {
      await resolve(memKey);
    }

    // CPU saturation
    const cpuKey = `server.cpu-saturation:${s.id}`;
    if (health.cpu?.risk) {
      const isNew = await raise(cpuKey, health.cpu.level, health.cpu.message, { serverId: s.id });
      if (isNew) {
        await emitWebhook(
          "server.warning",
          { serverId: s.id, name: s.name, kind: "cpu", cpu: Math.round(health.cpu.latest) },
          { serverId: s.id, ownerId: s.ownerId },
        );
      }
    } else if (!health.cpu || health.cpu.latest < CPU_CLEAR) {
      await resolve(cpuKey);
    }
  }
}
