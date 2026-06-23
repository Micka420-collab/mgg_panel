/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MGG Discord control bot
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  A small, self-contained discord.js v14 bot that lets you control your MGG
 *  game servers from Discord with global slash commands:
 *
 *      /servers                 — list every server you can access
 *      /status   <server>       — live state, address and player count
 *      /start    <server>       — start a server
 *      /stop     <server>       — stop a server
 *      /restart  <server>       — restart a server
 *      /say      <server> <msg> — broadcast a message in-game (console "say")
 *      /backup   <server>       — create a backup
 *
 *  It authenticates to the public MGG API (`/api/v1`) with a single bearer
 *  **API key**, so the bot acts as one MGG account. The required scopes are
 *  enforced by the key itself — the bot can only do what the key is allowed to.
 *
 *  Configuration (environment variables):
 *      DISCORD_TOKEN      — the Discord bot token              (required)
 *      DISCORD_CLIENT_ID  — the Discord application (client) id (required)
 *      MGG_API_URL     — base URL of the MGG panel        (default http://localhost:3000)
 *      MGG_API_KEY     — an MGG API key (Account → API keys, "aeth_…")  (required)
 *      DISCORD_ALLOWED_USER_IDS  — comma-separated Discord user ids allowed to use the bot
 *      DISCORD_ALLOWED_GUILD_IDS — comma-separated guild ids the bot may be used in
 *          ⚠ At least one allowlist is REQUIRED: with neither set the bot denies
 *            every command (fail closed), since anyone who can invoke it controls
 *            the account's servers.
 *
 *  On boot the bot (re)registers its slash commands (per-guild when a guild
 *  allowlist is set, else global), then logs in.
 *  Run with:  npm start   (node src/index.js after `npm run build`)
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? "";
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const MGG_API_URL = (process.env.MGG_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const MGG_API_KEY = process.env.MGG_API_KEY ?? "";

/**
 * Authorization allowlists (comma-separated ids). The bot acts as ONE MGG
 * account, so anyone able to invoke a command can control those servers — the
 * bot MUST therefore gate who may use it. Secure default: if BOTH lists are
 * empty the bot denies every command (see {@link isAuthorized}). Set at least
 * one to authorize use, and prefer adding the bot only to trusted guilds.
 */
const ALLOWED_USER_IDS = (process.env.DISCORD_ALLOWED_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_GUILD_IDS = (process.env.DISCORD_ALLOWED_GUILD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Whether an interaction is allowed to control servers.
 *  - No allowlist configured at all → DENY everyone (fail closed).
 *  - A guild allowlist is set → the command must come from an allowed guild
 *    (DMs, which have no guildId, are rejected).
 *  - A user allowlist is set → the invoking user must be on it.
 *  - Both set → both checks must pass.
 */
function isAuthorized(i: ChatInputCommandInteraction): boolean {
  if (ALLOWED_USER_IDS.length === 0 && ALLOWED_GUILD_IDS.length === 0) return false;
  if (ALLOWED_GUILD_IDS.length > 0 && (!i.guildId || !ALLOWED_GUILD_IDS.includes(i.guildId))) return false;
  if (ALLOWED_USER_IDS.length > 0 && !ALLOWED_USER_IDS.includes(i.user.id)) return false;
  return true;
}

/** Brand accent (MGG "Sci-Fi Lab" cyan) used for neutral embeds. */
const ACCENT = 0x22b8d8;
/** Map a server state to a traffic-light embed colour. */
const stateColor = (s: string): number =>
  s === "running" ? 0x34d399 : s === "errored" ? 0xf85149 : s === "offline" ? 0x6b7280 : 0xfbbf24;

// ─── MGG API client ──────────────────────────────────────────────────────

/** Shape returned by `GET /api/v1/client` for each accessible server. */
interface ServerSummary {
  id: string;
  name: string;
  game: string;
  node: string;
  state: string;
  address: string | null;
  owner: boolean;
}

/** Shape returned by `GET /api/v1/client/servers/:id/connection`. */
interface ConnectionInfo {
  address: string;
  host: string;
  port: number;
  state: string;
  game: string;
  players?: { online: number; max: number };
  version?: string;
  motd?: string;
}

/**
 * Minimal JSON fetch helper against the MGG v1 API. Adds the bearer key,
 * serialises the body, and surfaces the API's `{ error }` message on failure.
 * Returns `undefined` for 204 No Content responses (power/command endpoints).
 */
async function mggFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${MGG_API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${MGG_API_KEY}`,
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const message = (data && typeof data === "object" && "error" in data && (data as any).error) || `MGG API ${res.status}`;
    throw new Error(String(message));
  }
  return data as T;
}

/** Parse JSON without throwing — returns null on malformed bodies. */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const mgg = {
  /** List every server the key's account can access. */
  listServers: () => mggFetch<{ servers: ServerSummary[] }>("/api/v1/client").then((r) => r.servers),
  /** Live connection/status info (address, state, players, version). */
  connection: (id: string) => mggFetch<ConnectionInfo>(`/api/v1/client/servers/${id}/connection`),
  /** Send a power signal: start | stop | restart | kill. */
  power: (id: string, signal: "start" | "stop" | "restart" | "kill") =>
    mggFetch<void>(`/api/v1/client/servers/${id}/power`, { method: "POST", body: { signal } }),
  /** Run a raw console command (the daemon delivers it via RCON). */
  command: (id: string, command: string) =>
    mggFetch<void>(`/api/v1/client/servers/${id}/command`, { method: "POST", body: { command } }),
  /** Create a backup (optional friendly name). */
  backup: (id: string, name?: string) =>
    mggFetch<{ id: string; name: string; sizeBytes: number; completed: boolean }>(
      `/api/v1/client/servers/${id}/backups`,
      { method: "POST", body: name ? { name } : {} },
    ),
};

/**
 * Resolve a user-typed `<server>` reference to a concrete server. Accepts an
 * exact id, an exact (case-insensitive) name, or a partial id/name match.
 * Returns `null` if nothing matches.
 */
async function resolveServer(ref: string): Promise<ServerSummary | null> {
  const servers = await mgg.listServers();
  const needle = ref.trim().toLowerCase();
  return (
    servers.find((s) => s.id === ref) ??
    servers.find((s) => s.name.toLowerCase() === needle) ??
    servers.find((s) => s.id.toLowerCase().startsWith(needle) || s.name.toLowerCase().includes(needle)) ??
    null
  );
}

// ─── Slash command definitions ──────────────────────────────────────────────

/** Helper: attach a required `server` string option to a command builder. */
const withServer = (b: SlashCommandBuilder) =>
  b.addStringOption((o) => o.setName("server").setDescription("Server name or id").setRequired(true));

const commands: RESTPostAPIApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder().setName("servers").setDescription("List your MGG servers"),
  withServer(new SlashCommandBuilder().setName("status").setDescription("Show a server's status & address")),
  withServer(new SlashCommandBuilder().setName("start").setDescription("Start a server")),
  withServer(new SlashCommandBuilder().setName("stop").setDescription("Stop a server")),
  withServer(new SlashCommandBuilder().setName("restart").setDescription("Restart a server")),
  withServer(new SlashCommandBuilder().setName("say").setDescription("Broadcast a message in-game")).addStringOption((o) =>
    o.setName("message").setDescription("The message to broadcast").setRequired(true),
  ),
  withServer(new SlashCommandBuilder().setName("backup").setDescription("Create a backup")),
].map((c) => c.toJSON());

/**
 * Register slash commands. When a guild allowlist is configured we register to
 * those guilds only (instant propagation + the commands never appear in
 * untrusted servers); otherwise we fall back to global registration and warn if
 * no allowlist is set at all (the bot will then deny every command).
 */
async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  if (ALLOWED_GUILD_IDS.length > 0) {
    for (const gid of ALLOWED_GUILD_IDS) {
      await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, gid), { body: commands });
    }
    console.log(`✓ Registered ${commands.length} commands to ${ALLOWED_GUILD_IDS.length} allowed guild(s).`);
  } else {
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
    console.log(`✓ Registered ${commands.length} global slash commands.`);
    if (ALLOWED_USER_IDS.length === 0) {
      console.warn(
        "⚠ No DISCORD_ALLOWED_USER_IDS or DISCORD_ALLOWED_GUILD_IDS configured — the bot will DENY every command. " +
          "Set at least one allowlist to authorize use.",
      );
    }
  }
}

// ─── Command handlers ───────────────────────────────────────────────────────

/** Dispatch a single chat-input interaction to its handler. */
async function handleInteraction(i: ChatInputCommandInteraction): Promise<void> {
  // Authorization gate — the bot acts as one MGG account, so reject anyone not
  // on the allowlist BEFORE doing any work. Reply privately so we don't leak
  // the bot's existence/usage to unauthorized users.
  if (!isAuthorized(i)) {
    await i.reply({
      content: "⛔ You're not authorized to control these servers.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // All handlers touch the network, so always defer first to avoid the 3s timeout.
  await i.deferReply();

  // /servers — no <server> argument.
  if (i.commandName === "servers") {
    const servers = await mgg.listServers();
    if (servers.length === 0) {
      await i.editReply("You have no servers on this account.");
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(ACCENT)
      .setTitle("Your MGG servers")
      .setDescription(
        servers
          .map(
            (s) =>
              `**${s.name}** · \`${s.game}\` — ${s.state}\n` +
              `\`${s.id}\`${s.address ? ` · ${s.address}` : ""} · node \`${s.node}\``,
          )
          .join("\n\n"),
      )
      .setFooter({ text: `${servers.length} server${servers.length === 1 ? "" : "s"}` });
    await i.editReply({ embeds: [embed] });
    return;
  }

  // Every other command resolves a <server> first.
  const ref = i.options.getString("server", true);
  const srv = await resolveServer(ref);
  if (!srv) {
    await i.editReply(`No server matching \`${ref}\`. Try \`/servers\` to see the exact names.`);
    return;
  }

  switch (i.commandName) {
    case "status": {
      const c = await mgg.connection(srv.id);
      const embed = new EmbedBuilder()
        .setColor(stateColor(c.state))
        .setTitle(srv.name)
        .addFields(
          { name: "State", value: c.state, inline: true },
          { name: "Address", value: c.address || "—", inline: true },
          { name: "Players", value: c.players ? `${c.players.online}/${c.players.max}` : "—", inline: true },
        );
      if (c.version) embed.setFooter({ text: `${srv.game} · v${c.version}` });
      await i.editReply({ embeds: [embed] });
      return;
    }

    case "start":
    case "stop":
    case "restart": {
      await mgg.power(srv.id, i.commandName);
      await i.editReply(`✅ Sent **${i.commandName}** to **${srv.name}**.`);
      return;
    }

    case "say": {
      const message = i.options.getString("message", true);
      // The daemon delivers console commands via RCON; "say" broadcasts in-game.
      await mgg.command(srv.id, `say ${message}`);
      await i.editReply(`✅ Broadcast on **${srv.name}**: ${message}`);
      return;
    }

    case "backup": {
      const b = await mgg.backup(srv.id);
      const mb = (b.sizeBytes / (1024 * 1024)).toFixed(1);
      await i.editReply(`✅ Created backup **${b.name}** on **${srv.name}** (${mb} MB).`);
      return;
    }

    default:
      await i.editReply(`Unknown command \`/${i.commandName}\`.`);
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

/** Fail fast with a clear message if any required env var is missing. */
function assertConfig(): void {
  const missing: string[] = [];
  if (!DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
  if (!DISCORD_CLIENT_ID) missing.push("DISCORD_CLIENT_ID");
  if (!MGG_API_KEY) missing.push("MGG_API_KEY");
  if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
    console.error("Required: DISCORD_TOKEN, DISCORD_CLIENT_ID, MGG_API_KEY (and optionally MGG_API_URL).");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertConfig();

  // Register global commands on every boot so updates roll out automatically.
  await registerCommands().catch((e) => {
    console.error("Failed to register slash commands:", e);
    process.exit(1);
  });

  // Guilds intent is all we need — slash commands don't require message content.
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (c) => {
    console.log(`🤖 MGG bot online as ${c.user.tag} — talking to ${MGG_API_URL}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await handleInteraction(interaction);
    } catch (err) {
      const msg = `⚠️ ${err instanceof Error ? err.message : "command failed"}`;
      // Reply (or edit the deferred reply) so the user always gets feedback.
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });

  await client.login(DISCORD_TOKEN);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
