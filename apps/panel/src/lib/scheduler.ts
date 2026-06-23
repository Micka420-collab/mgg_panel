import "server-only";
import parser from "cron-parser";
import { db } from "./db";
import { DaemonClient } from "./daemon";
import { enforceBackupRetention } from "./backups";
import { meterBilling } from "./billing";
import { monitorTick } from "./monitor";
import { updateDuckDnsFromEnv, duckDnsConfigured } from "./ddns";
import { recordStats } from "./metrics";
import { detectResourcePressure } from "./predict";
import { resyncDomains, caddyConfigured } from "./reverse-proxy";

/** Next fire time for a cron expression in a pinned timezone, or null if invalid. */
export function nextRun(cron: string, timezone: string, from: Date = new Date()): Date | null {
  try {
    const it = parser.parseExpression(cron, { currentDate: from, tz: timezone });
    return it.next().toDate();
  } catch {
    return null;
  }
}

export function isValidCron(cron: string, timezone = "UTC"): boolean {
  try {
    parser.parseExpression(cron, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

type ScheduleWithRelations = NonNullable<Awaited<ReturnType<typeof loadDue>>>[number];

function loadDue(now: Date) {
  return db.schedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    include: { tasks: { orderBy: { sequence: "asc" } }, server: { include: { node: true } } },
  });
}

async function runTask(
  server: ScheduleWithRelations["server"],
  task: ScheduleWithRelations["tasks"][number],
) {
  const client = new DaemonClient(server.node);
  switch (task.action) {
    case "POWER":
      await client.power(server.id, (task.payload || "restart").trim());
      break;
    case "COMMAND":
      if (task.payload.trim()) await client.command(server.id, task.payload.trim());
      break;
    case "BACKUP": {
      await enforceBackupRetention(server.id, server.node);
      const count = await db.backup.count({ where: { serverId: server.id } });
      const row = await db.backup.create({
        data: { serverId: server.id, name: task.payload.trim() || `Scheduled #${count + 1}`, completed: false },
      });
      try {
        const meta = await client.createBackup(server.id, row.id, row.name);
        await db.backup.update({ where: { id: row.id }, data: { completed: true, sizeBytes: BigInt(meta.sizeBytes), checksum: meta.checksum } });
      } catch {
        await db.backup.delete({ where: { id: row.id } }).catch(() => {});
      }
      break;
    }
  }
}

async function runSchedule(s: ScheduleWithRelations) {
  for (const task of s.tasks) {
    if (task.offsetSeconds > 0) await new Promise((r) => setTimeout(r, Math.min(task.offsetSeconds, 600) * 1000));
    try {
      await runTask(s.server, task);
    } catch (e) {
      console.error(`[scheduler] task ${task.id} failed`, e);
      if (!task.continueOnFailure) break;
    }
  }
}

/** One scheduler pass: fire due schedules and roll their next-run forward. */
export async function tick(): Promise<void> {
  const now = new Date();
  const due = await loadDue(now);
  for (const s of due) {
    await db.schedule.update({
      where: { id: s.id },
      data: { lastRunAt: now, nextRunAt: nextRun(s.cron, s.timezone, now) },
    });
    void runSchedule(s); // don't block the loop on task offsets
  }
  // meter running servers against their owners' credit wallets
  await meterBilling().catch((e) => console.error("[scheduler] billing failed", e));
  // node health + crash detection / auto-restart
  await monitorTick().catch((e) => console.error("[scheduler] monitor failed", e));
  // keep the DuckDNS stable address pointed at the current public IP
  if (duckDnsConfigured()) {
    await updateDuckDnsFromEnv().catch((e) => console.error("[scheduler] ddns failed", e));
  }
  // sample running-server resource usage into history
  await recordStats().catch((e) => console.error("[scheduler] metrics failed", e));
  // predictive crash/OOM early-warning over the freshly-sampled history
  await detectResourcePressure().catch((e) => console.error("[scheduler] predict failed", e));
}

let started = false;
/** Start the in-process minute scheduler (idempotent). */
export function startScheduler(): void {
  if (started) return;
  started = true;
  // align loosely to the minute, then run every 60s
  setInterval(() => {
    tick().catch((e) => console.error("[scheduler] tick failed", e));
  }, 60_000);
  console.log("[scheduler] started (60s interval)");

  // Re-apply custom-domain reverse-proxy routes once Caddy is up (it loses
  // admin-added routes on a reload/restart). Delayed so the proxy can boot.
  if (caddyConfigured()) {
    setTimeout(() => {
      resyncDomains().catch((e) => console.error("[scheduler] domain resync failed", e));
    }, 10_000);
  }
}
