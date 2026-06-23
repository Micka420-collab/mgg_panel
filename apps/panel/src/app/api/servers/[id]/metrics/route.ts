import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertScope } from "@/lib/access";
import { db } from "@/lib/db";
import { assessHealth, WINDOW_MIN, type HealthAssessment } from "@/lib/predict";

const query = z.object({
  // Window length in hours (default 6h, capped at the 7-day retention window).
  hours: z.coerce.number().min(1).max(168).default(6),
});

export interface MetricPoint {
  ts: number;
  cpu: number;
  memMb: number;
  players: number;
  diskMb: number;
  netRxKbps: number;
  netTxKbps: number;
}

/** Aggregate figures for one numeric series over the window. */
export interface MetricSummary {
  current: number;
  avg: number;
  peak: number;
  min: number;
}

/** One row of the server's recent events/incident history. */
export interface ServerEvent {
  level: string;
  message: string;
  resolved: boolean;
  at: number;
}

function summarise(values: number[]): MetricSummary {
  if (values.length === 0) return { current: 0, avg: 0, peak: 0, min: 0 };
  let sum = 0;
  let peak = -Infinity;
  let min = Infinity;
  for (const v of values) {
    sum += v;
    if (v > peak) peak = v;
    if (v < min) min = v;
  }
  return {
    current: values[values.length - 1]!,
    avg: Math.round((sum / values.length) * 10) / 10,
    peak,
    min,
  };
}

/**
 * Historical resource samples for the server's "Stats" tab. Read-only, so it's
 * gated on console-view access. Returns points oldest-first within the window,
 * plus per-metric summaries (current/avg/peak/min), resource caps for context,
 * a forward-looking health assessment, and the server's recent event history.
 */
export const GET = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "control.console");

  const { hours } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [rows, alerts] = await Promise.all([
    db.serverStat.findMany({
      where: { serverId: c.server.id, ts: { gte: since } },
      orderBy: { ts: "asc" },
      select: { ts: true, cpu: true, memMb: true, players: true, diskMb: true, netRxKbps: true, netTxKbps: true },
      take: 5000,
    }),
    db.alert.findMany({
      where: { serverId: c.server.id },
      orderBy: { createdAt: "desc" },
      select: { level: true, message: true, resolved: true, createdAt: true },
      take: 20,
    }),
  ]);

  const points: MetricPoint[] = rows.map((r) => ({
    ts: r.ts.getTime(),
    cpu: r.cpu,
    memMb: r.memMb,
    players: r.players,
    diskMb: r.diskMb,
    netRxKbps: r.netRxKbps,
    netTxKbps: r.netTxKbps,
  }));

  const summary = {
    cpu: summarise(points.map((p) => p.cpu)),
    memMb: summarise(points.map((p) => p.memMb)),
    diskMb: summarise(points.map((p) => p.diskMb)),
    players: summarise(points.map((p) => p.players)),
    netRxKbps: summarise(points.map((p) => p.netRxKbps)),
    netTxKbps: summarise(points.map((p) => p.netTxKbps)),
  };

  const events: ServerEvent[] = alerts.map((a) => ({
    level: a.level,
    message: a.message,
    resolved: a.resolved,
    at: a.createdAt.getTime(),
  }));

  // Forward-looking health from the recent tail (same logic the scheduler uses
  // to raise predictive alerts), so the Stats tab can show a live warning badge.
  const cutoff = Date.now() - WINDOW_MIN * 60 * 1000;
  const recent = points.filter((p) => p.ts >= cutoff).map((p) => ({ ts: p.ts, cpu: p.cpu, memMb: p.memMb }));
  const health: HealthAssessment = assessHealth(recent, c.server.memoryMb, c.server.name);

  return json({
    points,
    summary,
    events,
    health,
    caps: { memMb: c.server.memoryMb, diskMb: c.server.diskMb },
  });
});
