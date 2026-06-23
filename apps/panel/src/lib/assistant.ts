import "server-only";

/**
 * AI Server Copilot — a per-server chat helper.
 *
 * Two modes, picked at call time so the feature is useful with ZERO config:
 *  - If ANTHROPIC_API_KEY is set, we call the Anthropic Messages API
 *    (claude-haiku-4-5) over plain `fetch`, feeding it a system prompt that
 *    describes MGG + the live server context.
 *  - If the key is UNSET (or the API call fails), we fall back to a deterministic
 *    rule-based helper that pattern-matches the most common questions (start
 *    failures, adding mods/plugins, changing port/difficulty/MOTD, backups) using
 *    the same context.
 *
 * This module never throws on a missing key and never lets an upstream failure
 * bubble up — askAssistant always resolves to a usable reply.
 */

export interface AssistantVariable {
  /** Environment variable name, e.g. DIFFICULTY */
  key: string;
  /** Human label from the template, when known */
  name?: string;
  /** Current effective value (env override or default) */
  value?: string;
  /** Allowed enum options, when the variable is a picker */
  options?: { value: string; label: string }[];
}

export interface AssistantContext {
  serverName: string;
  /** game family, e.g. "minecraft" */
  game: string;
  /** template id, e.g. "minecraft-java" */
  templateId: string;
  /** human template name, e.g. "Minecraft: Java" */
  templateName?: string;
  /** server software/flavour, from env TYPE (PAPER, FABRIC, VANILLA, ...) */
  type?: string;
  /** game version, from env VERSION / SERVER_VERSION */
  version?: string;
  /** current live state: running / offline / starting / installing / errored ... */
  state: string;
  /** template capability flags (mods, plugins, modpacks, rcon, eula ...) */
  features: string[];
  /** user-viewable startup variables with their current values */
  variables: AssistantVariable[];
  /** recent console lines, newest last — empty when not available */
  consoleTail?: string[];
  /** whether the caller may run console commands (gates one-click apply chips) */
  canCommand: boolean;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

/** A real action the agentic Copilot performed via a tool, for the UI timeline. */
export interface AgentAction {
  /** Tool name, e.g. "power_server" / "install_content" / "create_server". */
  tool: string;
  /** Human one-liner describing what happened, e.g. "Started Survival SMP". */
  summary: string;
  /** Whether the action succeeded (false → shown as a failed/blocked step). */
  ok: boolean;
}

export interface AssistantResult {
  reply: string;
  /** Concrete console commands the user can one-click apply (no leading slash). */
  suggestedCommands?: string[];
  /** Real actions the agent took this turn (agentic AI path only). */
  actions?: AgentAction[];
  /** Which engine produced the reply, for the UI to label. */
  source: "ai" | "rules";
}

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-chat";

/** AI backend config passed by the caller (resolved from settings/env). */
export interface AiCallConfig {
  provider: "anthropic" | "openrouter";
  key: string | null;
  /** Model id; falls back to a per-provider default when omitted. */
  model?: string;
}

/**
 * Public entrypoint. Picks the AI path when a key exists, else the rule engine.
 *
 * `ai` lets the caller pass the AI config resolved at request time (provider +
 * key + model from the admin dashboard, which takes precedence over env). For
 * back-compat a bare string is treated as an Anthropic key, and when omitted we
 * fall back to the ANTHROPIC_API_KEY env var so the function stays standalone.
 */
export async function askAssistant(
  ctx: AssistantContext,
  messages: AssistantMessage[],
  ai?: AiCallConfig | string | null,
): Promise<AssistantResult> {
  const cfg: AiCallConfig =
    typeof ai === "string"
      ? { provider: "anthropic", key: ai }
      : ai && typeof ai === "object"
        ? ai
        : { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY ?? null };

  const key = cfg.key?.trim();
  if (key) {
    try {
      return cfg.provider === "openrouter"
        ? await askOpenRouter(key, cfg.model || DEFAULT_OPENROUTER_MODEL, ctx, messages)
        : await askAnthropic(key, ctx, messages, cfg.model);
    } catch (e) {
      // Never surface upstream/network/quota errors to the user — degrade to the
      // deterministic helper so the chat keeps working.
      console.error("[assistant] AI call failed, falling back to rules:", e);
      return rulesReply(ctx, messages);
    }
  }
  return rulesReply(ctx, messages);
}

// ── AI path ────────────────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: AssistantContext): string {
  const vars = ctx.variables.length
    ? ctx.variables
        .map((v) => {
          const opts = v.options?.length ? ` (options: ${v.options.map((o) => o.value).join(", ")})` : "";
          return `- ${v.key}${v.name ? ` "${v.name}"` : ""} = ${v.value ?? "(unset)"}${opts}`;
        })
        .join("\n")
    : "(none exposed)";
  const tail = ctx.consoleTail?.length
    ? ctx.consoleTail.slice(-40).join("\n")
    : "(console history not available — ask the user to check the Console tab)";

  return [
    "You are the MGG Server Copilot, an expert assistant embedded in the MGG game-server hosting panel",
    "(a self-hostable Pterodactyl/Aternos-style control panel). You help the user operate ONE specific game server.",
    "Be concise, practical and friendly. Prefer concrete steps over theory. Use the live context below.",
    "",
    "MGG facts you can rely on:",
    "- Minecraft servers run on the itzg/minecraft-server image; software is set by the TYPE env var (VANILLA, PAPER, PURPUR, FABRIC, FORGE, NEOFORGE...).",
    "- Plugins/mods on Minecraft are installed by the panel's Content tab (Modrinth-backed) or via MODRINTH_PROJECTS; a restart applies them.",
    "- Startup variables (difficulty, MOTD, max players, version, etc.) are edited in the Settings tab and apply on the next start/restart.",
    "- Backups live in the Backups tab. Crossplay (Java<->Bedrock) lives in the Network tab.",
    "- You can propose console commands the user can one-click run. ONLY do so when it genuinely helps and the server type supports a console (Minecraft does).",
    "",
    "When you propose runnable console commands, append a final line EXACTLY of the form:",
    "COMMANDS: cmd one || cmd two",
    "Use '||' to separate multiple commands, write them WITHOUT a leading slash, and omit the line entirely if there are no commands.",
    "Never invent commands the user can't run; for non-Minecraft games, avoid Minecraft-only commands.",
    "",
    "Live server context:",
    `- Name: ${ctx.serverName}`,
    `- Game: ${ctx.game} (template ${ctx.templateName ?? ctx.templateId})`,
    `- Software/type: ${ctx.type ?? "unknown"}`,
    `- Version: ${ctx.version ?? "unknown"}`,
    `- State: ${ctx.state}`,
    `- Features: ${ctx.features.join(", ") || "none"}`,
    `- User can run console commands: ${ctx.canCommand ? "yes" : "no"}`,
    "- Startup variables:",
    vars,
    "- Recent console lines (oldest first):",
    tail,
  ].join("\n");
}

async function askAnthropic(
  key: string,
  ctx: AssistantContext,
  messages: AssistantMessage[],
  model?: string,
): Promise<AssistantResult> {
  // Trim to the last ~16 turns to keep the request small and bounded.
  const trimmed = messages
    .filter((m) => m.content && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content }));
  if (trimmed.length === 0) trimmed.push({ role: "user", content: "Hello" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(ctx),
        messages: trimmed,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`Anthropic API error: ${detail}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();

  const { reply, suggestedCommands } = extractCommands(text);
  return { reply: reply || "I'm not sure how to help with that — try rephrasing.", suggestedCommands, source: "ai" };
}

/**
 * OpenRouter path — OpenAI-compatible Chat Completions. Lets the Copilot run on
 * any OpenRouter-hosted model (DeepSeek, Llama, Qwen, GPT, Gemini…) instead of
 * Anthropic. The system prompt is sent as the first `system` message; the
 * `COMMANDS:` convention still works for one-click command chips.
 */
async function askOpenRouter(
  key: string,
  model: string,
  ctx: AssistantContext,
  messages: AssistantMessage[],
): Promise<AssistantResult> {
  const trimmed = messages
    .filter((m) => m.content && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content }));
  if (trimmed.length === 0) trimmed.push({ role: "user", content: "Hello" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        // OpenRouter asks for these for attribution/routing; harmless if generic.
        "HTTP-Referer": process.env.APP_URL || "https://mgg.panel",
        "X-Title": "MGG Server Copilot",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "system", content: buildSystemPrompt(ctx) }, ...trimmed],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`OpenRouter API error: ${detail}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  const { reply, suggestedCommands } = extractCommands(text);
  return { reply: reply || "I'm not sure how to help with that — try rephrasing.", suggestedCommands, source: "ai" };
}

/** Pull a trailing `COMMANDS: a || b` line out of the model reply, if present. */
function extractCommands(text: string): { reply: string; suggestedCommands?: string[] } {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => /^\s*COMMANDS\s*:/i.test(l));
  if (idx === -1) return { reply: text };
  const cmdLine = lines[idx].replace(/^\s*COMMANDS\s*:/i, "");
  const cmds = cmdLine
    .split("||")
    .map((c) => c.trim().replace(/^\//, ""))
    .filter(Boolean)
    .slice(0, 6);
  const reply = lines.slice(0, idx).join("\n").trim();
  return { reply, suggestedCommands: cmds.length ? cmds : undefined };
}

// ── Rule-based fallback (no key required) ────────────────────────────────────

function findVar(ctx: AssistantContext, ...keys: string[]): AssistantVariable | undefined {
  const wanted = keys.map((k) => k.toUpperCase());
  return ctx.variables.find((v) => wanted.includes(v.key.toUpperCase()));
}

function isMinecraft(ctx: AssistantContext): boolean {
  return ctx.game === "minecraft";
}

/**
 * A surprisingly useful deterministic helper. We classify the latest user
 * message into a handful of common intents and answer with context-aware,
 * actionable guidance — plus one-click commands when the server is Minecraft
 * and the user holds control.command.
 */
function rulesReply(ctx: AssistantContext, messages: AssistantMessage[]): AssistantResult {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() ?? "";
  const mc = isMinecraft(ctx);
  const canCmd = ctx.canCommand && mc;
  const out: string[] = [];
  const cmds: string[] = [];

  const has = (...words: string[]) => words.some((w) => last.includes(w));

  // 1) Start failures / crashes / "won't start"
  if (has("won't start", "wont start", "not start", "won't boot", "crash", "fail", "error", "stuck", "offline", "down")) {
    out.push(`Your server is currently **${ctx.state}**. Let's narrow down why it isn't running:`);
    out.push("1. Open the **Console** tab and read the last 20–30 lines — the real cause is almost always printed there (port in use, bad config, out-of-memory, missing EULA).");
    if (mc && ctx.features.includes("eula")) {
      const eula = findVar(ctx, "EULA");
      if (eula && eula.value !== "TRUE" && eula.value !== "true") {
        out.push("2. **EULA not accepted.** Minecraft refuses to boot until you accept Mojang's EULA — set `EULA` to `TRUE` in the **Settings** tab, then start again.");
      } else {
        out.push("2. Confirm the **EULA** is accepted in Settings (it must be `TRUE`).");
      }
    }
    if (mc) {
      out.push(`3. A bad mod/plugin is the #1 cause of boot loops. If you recently added content, remove it in the **Content** tab and restart. Current software: \`${ctx.type ?? "unknown"}\`, version \`${ctx.version ?? "unknown"}\`.`);
      out.push("4. If it logs `Out of memory` / exit code 137, raise the server's RAM in **Settings** (or your plan).");
    } else {
      out.push("3. Check that the version and startup variables in **Settings** are valid for this game, then restart.");
    }
    if (ctx.consoleTail?.length) {
      out.push("\nFrom the recent console I can see:\n```\n" + ctx.consoleTail.slice(-8).join("\n") + "\n```");
    }
    return finalize(out, cmds, ctx);
  }

  // 2) Adding plugins / mods / content
  if (has("plugin", "mod ", "mods", "modpack", "add a", "install")) {
    if (!mc) {
      out.push("Mods/plugins are managed per game. For this server, add content by uploading files in the **Files** tab or by setting the relevant startup variable in **Settings**, then restart.");
      return finalize(out, cmds, ctx);
    }
    const supportsContent = ["mods", "plugins", "modpacks"].some((f) => ctx.features.includes(f));
    if (!supportsContent || ctx.type === "VANILLA" || !ctx.type) {
      out.push(`Your server runs \`${ctx.type ?? "VANILLA"}\`, which can't load plugins or mods. To use them, switch the **server software** in **Settings** first:`);
      out.push("- **Plugins** → choose `PAPER` (or `PURPUR`/`SPIGOT`).");
      out.push("- **Mods** → choose `FABRIC`, `FORGE` or `NEOFORGE`.");
      out.push("Restart after changing it, then come back to the **Content** tab.");
      return finalize(out, cmds, ctx);
    }
    out.push("To add content:");
    out.push("1. Open the **Content** tab — it's backed by Modrinth, so you can search and one-click install plugins, mods and modpacks compatible with your version.");
    out.push(`2. Make sure each item matches your loader (\`${ctx.type}\`) and version (\`${ctx.version ?? "unknown"}\`).`);
    out.push("3. **Restart** the server so it loads the new files.");
    return finalize(out, cmds, ctx);
  }

  // 3) Difficulty
  if (has("difficulty", "hard", "peaceful", "easy", "normal")) {
    const wanted = last.includes("hard")
      ? "hard"
      : last.includes("peaceful")
        ? "peaceful"
        : last.includes("easy")
          ? "easy"
          : last.includes("normal")
            ? "normal"
            : null;
    if (mc) {
      const diff = findVar(ctx, "DIFFICULTY");
      out.push(
        `You can change difficulty two ways: edit the \`DIFFICULTY\` variable in **Settings** (currently \`${diff?.value ?? "normal"}\`) and restart, or run it live from the console.`,
      );
      if (wanted && canCmd) {
        out.push(`I've prepared the live command below — click to apply it now.`);
        cmds.push(`difficulty ${wanted}`);
      } else if (wanted) {
        out.push(`Set \`DIFFICULTY\` to \`${wanted}\` in Settings, then restart.`);
      }
    } else {
      out.push("Set the difficulty via the relevant startup variable in **Settings**, then restart.");
    }
    return finalize(out, cmds, ctx);
  }

  // 4) Port / address
  if (has("port", "address", "ip", "connect", "join")) {
    out.push("Your connection address is shown at the top of this server's page (click it to copy).");
    if (mc) {
      out.push("The port is assigned by MGG and lives in the **Network** tab — changing it there reallocates the listener. You can't move a Minecraft server to an arbitrary port from the console.");
      out.push("Want Bedrock players (mobile/console) to join your Java server? Enable **crossplay** in the **Network** tab.");
    } else {
      out.push("Manage listener ports in the **Network** tab.");
    }
    return finalize(out, cmds, ctx);
  }

  // 5) MOTD / name / description
  if (has("motd", "message of the day", "server name", "rename", "title")) {
    if (mc) {
      const motd = findVar(ctx, "MOTD");
      out.push(`The server list message is the \`MOTD\` variable (currently \`${motd?.value ?? "A Minecraft Server"}\`). Edit it in **Settings** and restart to apply.`);
      out.push("To rename the server **inside MGG** (not the in-game MOTD), use the **Settings** tab → name field.");
    } else {
      out.push("Set the MOTD/server message via its startup variable in **Settings**, then restart.");
    }
    return finalize(out, cmds, ctx);
  }

  // 6) Backups
  if (has("backup", "restore", "save world", "snapshot")) {
    out.push("Backups live in the **Backups** tab. Click **Create backup** to snapshot the whole server volume; you can restore or download any backup from the same list.");
    out.push("Tip: take a backup before installing new content or changing major settings, so you can roll back.");
    return finalize(out, cmds, ctx);
  }

  // 7) Players / whitelist / op / ban
  if (has("whitelist", "op ", "operator", "ban", "kick", "player")) {
    if (mc && canCmd) {
      out.push("You can manage players from the **Players** tab, or run live commands here. Tell me a username and what to do (op, whitelist, ban, kick) and I'll prep the command.");
      out.push("Common examples: `whitelist add <name>`, `op <name>`, `ban <name>`, `kick <name>`.");
    } else if (mc) {
      out.push("Manage players from the **Players** tab (op / whitelist / ban). Live console commands need the *Send commands* permission.");
    } else {
      out.push("Player management depends on this game — check the **Console** and game docs.");
    }
    return finalize(out, cmds, ctx);
  }

  // 8) Generic greeting / catch-all
  out.push(
    `Hi! I'm the MGG Copilot for **${ctx.serverName}** (${ctx.templateName ?? ctx.templateId}, currently **${ctx.state}**). I can help you with things like:`,
  );
  out.push("- Why won't my server start?");
  if (mc) {
    out.push("- How do I add a plugin or mod?");
    out.push("- Set the difficulty to hard / change the MOTD");
  }
  out.push("- Where are my backups / how do I restore?");
  out.push("- How do players connect?");
  out.push(
    "\n_(Running in offline rule-based mode — set `ANTHROPIC_API_KEY` on the panel to unlock full AI answers.)_",
  );
  return finalize(out, cmds, ctx);
}

function finalize(out: string[], cmds: string[], ctx: AssistantContext): AssistantResult {
  // Only surface commands the user can actually run.
  const usable = ctx.canCommand && isMinecraft(ctx) ? cmds.filter(Boolean).slice(0, 6) : [];
  return {
    reply: out.join("\n"),
    suggestedCommands: usable.length ? usable : undefined,
    source: "rules",
  };
}
