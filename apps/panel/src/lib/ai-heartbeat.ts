import "server-only";
import { db } from "./db";
import { DaemonClient } from "./daemon";
import { getAiConfig } from "./settings";
import { askAssistant, type AssistantContext } from "./assistant";
import { getTemplate } from "@mgg/shared";
import { sendDiscordWebhook } from "./notify";
import { env } from "./env";
import { emailAlert } from "./email";

/**
 * AI heartbeat — the Copilot's "pulse".
 *
 * Every cycle the scheduler calls aiHeartbeatTick(); for each running server,
 * throttled per-server, we feed the live state + resource metrics + player
 * roster to the configured AI (Anthropic or OpenRouter) and ask for a SHORT
 * health bilan. The result is stored as an Alert (deduped per server) so it
 * surfaces in the panel, and notable findings (warning/critical) are pushed to
 * Discord. Dormant when no AI key is configured — zero cost until enabled.
 */

const DEFAULT_MINUTES = 30;
const MAX_SERVERS = 20;

/** Per-server last-run timestamps (this process). */
const lastRun = new Map<string, number>();

function intervalMs(): number {
  const raw = process.env.AI_HEARTBEAT_MINUTES?.trim();
  if (raw === undefined || raw === "") return DEFAULT_MINUTES * 60_000;
  const m = Number.parseInt(raw, 10);
  if (!Number.isFinite(m)) return DEFAULT_MINUTES * 60_000;
  return m * 60_000; // 0 (or negative) disables the heartbeat
}

function fmtMb(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "?";
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

export async function aiHeartbeatTick(): Promise<void> {
  const everyMs = intervalMs();
  if (everyMs <= 0) return; // disabled via AI_HEARTBEAT_MINUTES=0

  const ai = await getAiConfig();
  if (!ai.key) return; // no AI configured → skip entirely (no cost)

  const now = Date.now();
  const servers = await runningServers();

  for (const s of servers) {
    if (now - (lastRun.get(s.id) ?? 0) < everyMs) continue;
    lastRun.set(s.id, now);
    try {
      await analyzeServer(s, ai);
    } catch (e) {
      console.error(`[ai-heartbeat] ${s.id} analysis failed`, e);
    }
  }
}

function runningServers() {
  return db.server.findMany({ where: { state: "running", suspended: false }, include: { node: true }, take: MAX_SERVERS });
}
type ServerRow = Awaited<ReturnType<typeof runningServers>>[number];

async function analyzeServer(s: ServerRow, ai: Awaited<ReturnType<typeof getAiConfig>>): Promise<void> {
  const client = new DaemonClient(s.node);
  let status: { state: string; stats: any; players: any; console?: any[] } | null = null;
  try {
    status = (await client.status(s.id, { console: 40 })) as {
      state: string;
      stats: any;
      players: any;
      console?: any[];
    };
  } catch {
    return; // node/daemon unreachable — skip this round
  }
  const state = status?.state ?? s.state;
  if (state !== "running") return;

  const stats = status?.stats ?? null;
  const players = (status?.players ?? null) as { online: number; max: number; sample?: string[] } | null;
  const envVars = (s.environment as Record<string, string>) ?? {};
  const tpl = getTemplate(s.templateId);

  const ctx: AssistantContext = {
    serverName: s.name,
    game: s.game,
    templateId: s.templateId,
    templateName: tpl?.name,
    type: envVars.TYPE ?? envVars.SERVER_TYPE,
    version: envVars.VERSION ?? envVars.SERVER_VERSION ?? envVars.MC_VERSION,
    state,
    features: tpl?.features ?? [],
    variables: [],
    consoleTail: Array.isArray(status?.console)
      ? status.console
          .map((l: any) => (typeof l === "string" ? l : l?.line))
          .filter((x: any) => !!x && String(x).trim().length > 0)
          .slice(-25)
      : undefined,
    canCommand: false,
  };

  const metrics = [
    stats ? `CPU ${stats.cpuPercentOfLimit ?? "?"}%` : "CPU ?",
    stats ? `RAM ${fmtMb(stats.memoryBytes)}/${fmtMb(stats.memoryLimitBytes)}` : "RAM ?",
    players ? `Joueurs ${players.online}/${players.max}${players.sample?.length ? ` (${players.sample.join(", ")})` : ""}` : "Joueurs ?",
    stats?.uptimeSeconds ? `uptime ${Math.round(stats.uptimeSeconds / 3600)}h` : "",
    stats?.latencyMs != null ? `latence ${stats.latencyMs}ms` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const prompt = [
    "Fais un bilan de santé COURT de ce serveur de jeu (1 à 2 phrases max), en français.",
    "Commence ta réponse EXACTEMENT par l'un de ces marqueurs : [OK], [ATTENTION] ou [CRITIQUE].",
    "Signale seulement ce qui mérite l'attention de l'admin (RAM/CPU élevés, latence forte, serveur vide depuis longtemps, état anormal…). Si tout va bien, réponds [OK] + une courte phrase rassurante.",
    "Ne propose AUCUNE commande.",
    "",
    `Métriques live : ${metrics}`,
  ].join("\n");

  const res = await askAssistant(ctx, [{ role: "user", content: prompt }], {
    provider: ai.provider,
    key: ai.key,
    model: ai.model,
  });
  const text = (res.reply || "").trim();
  if (!text) return;

  const level: "info" | "warning" | "critical" = /\[CRITIQUE\]/i.test(text)
    ? "critical"
    : /\[ATTENTION\]/i.test(text)
      ? "warning"
      : "info";
  const message = text.replace(/^\s*\[(OK|ATTENTION|CRITIQUE)\]\s*/i, "").slice(0, 500) || text.slice(0, 500);

  const key = `ai.insight:${s.id}`;
  const existing = await db.alert.findUnique({ where: { key } });
  // Keep ONE live insight per server (refreshed each cycle), visible in the panel.
  await db.alert.upsert({
    where: { key },
    update: { level, message: `🧠 ${message}`, resolved: false },
    create: { key, level, message: `🧠 ${message}`, serverId: s.id, resolved: false },
  });

  // Notify Discord only on notable findings, and only when the level changes
  // (or it's the first one / was resolved) — never spam an unchanged status.
  const notable = level !== "info";
  const changed = !existing || existing.level !== level || existing.resolved;
  if (notable && changed) {
    if (env.alertWebhook) {
      await sendDiscordWebhook(env.alertWebhook, {
        title: `🧠 Bilan IA — ${s.name}`,
        description: message,
        level,
        ts: new Date().toISOString(),
      }).catch(() => {});
    }
    await emailAlert({ level, message: `Bilan IA — ${s.name} : ${message}`, serverId: s.id }).catch(() => {});
  }
}
