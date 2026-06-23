import "server-only";
import { db } from "./db";
import { DaemonClient } from "./daemon";
import { env } from "./env";
import { sendDiscordWebhook } from "./notify";
import { emitWebhook } from "./webhooks";
import { emailAlert } from "./email";

type Level = "info" | "warning" | "critical";

/** Raise (or keep) an alert, deduped by key; notifies Discord only on first raise. */
async function raise(key: string, level: Level, message: string, opts: { serverId?: string; nodeId?: string } = {}) {
  const existing = await db.alert.findUnique({ where: { key } });
  if (existing && !existing.resolved) return; // already active — don't re-notify
  await db.alert.upsert({
    where: { key },
    update: { level, message, resolved: false },
    create: { key, level, message, serverId: opts.serverId ?? null, nodeId: opts.nodeId ?? null },
  });
  if (env.alertWebhook) {
    await sendDiscordWebhook(env.alertWebhook, { title: `⚠️ ${message}`, description: key, level, ts: new Date().toISOString() });
  }
  await emailAlert({ level, message, serverId: opts.serverId ?? null });
}

async function resolve(key: string) {
  const a = await db.alert.findUnique({ where: { key } });
  if (a && !a.resolved) {
    await db.alert.update({ where: { key }, data: { resolved: true } });
    if (env.alertWebhook) {
      await sendDiscordWebhook(env.alertWebhook, { title: `✅ Resolved: ${a.message}`, level: "info", ts: new Date().toISOString() });
    }
  }
}

/**
 * One monitoring pass: node reachability + crashed-server detection (with
 * optional auto-restart). Run from the scheduler each minute.
 */
export async function monitorTick(): Promise<void> {
  const nodes = await db.node.findMany();
  const reachable = new Set<string>();
  for (const node of nodes) {
    try {
      await new DaemonClient(node).health();
      reachable.add(node.id);
      await resolve(`node.down:${node.id}`);
      // Keep the node's capacity in sync with the host's real physical RAM, so
      // memory admission/display are accurate without manual tuning.
      try {
        const sys = await new DaemonClient(node).system();
        const mb = Math.round((sys?.memTotal ?? 0) / (1024 * 1024));
        if (mb > 0 && mb !== node.memoryMb) await db.node.update({ where: { id: node.id }, data: { memoryMb: mb } });
      } catch {
        /* system endpoint optional */
      }
    } catch {
      await raise(`node.down:${node.id}`, "critical", `Node "${node.name}" is unreachable`, { nodeId: node.id });
    }
  }

  const servers = await db.server.findMany({
    where: { state: { in: ["running", "starting"] }, suspended: false },
    include: { node: true },
    take: 100,
  });
  for (const s of servers) {
    if (!reachable.has(s.nodeId)) continue;
    let state: string;
    try {
      state = (await new DaemonClient(s.node).status(s.id)).state;
    } catch {
      continue;
    }

    if (state === "errored") {
      await raise(`server.errored:${s.id}`, "warning", `Server "${s.name}" crashed`, { serverId: s.id });
      await db.server.update({ where: { id: s.id }, data: { state: "errored" } });
      await emitWebhook("server.errored", { serverId: s.id, name: s.name }, { serverId: s.id, ownerId: s.ownerId });
      if (s.autoRestart) {
        try {
          await new DaemonClient(s.node).power(s.id, "start");
          await db.server.update({ where: { id: s.id }, data: { state: "starting" } });
          await raise(`server.restarted:${s.id}`, "info", `Auto-restarted "${s.name}"`, { serverId: s.id });
          await emitWebhook("server.restarted", { serverId: s.id, name: s.name }, { serverId: s.id, ownerId: s.ownerId });
        } catch {
          /* node trouble */
        }
      }
    } else if (state === "running") {
      await resolve(`server.errored:${s.id}`);
      await resolve(`server.restarted:${s.id}`);
      if (s.state !== "running") await db.server.update({ where: { id: s.id }, data: { state: "running" } });
    }
  }
}
