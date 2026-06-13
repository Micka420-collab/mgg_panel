import { Rcon } from "rcon-client";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Thin RCON helper. `host` is resolved by the caller via docker.rconHost():
 * the game container's name when the daemon is containerized (reached over the
 * dedicated game network), or 127.0.0.1 for a host-mode daemon. RCON is never
 * published publicly, so players cannot reach it.
 */
export async function sendRcon(host: string, port: number, password: string, command: string): Promise<string> {
  const rcon = await Rcon.connect({ host, port, password, timeout: 5000 });
  // Swallow async socket errors (a server crashing mid-connection emits an
  // ECONNRESET 'error' event). Without a listener, Node treats it as an
  // unhandled 'error' and crashes the whole daemon process — so a single game
  // server crash must never take the daemon down with it.
  rcon.on("error", (e) => {
    if (config.logLevel === "debug") logger.debug({ e }, "rcon socket error (ignored)");
  });
  try {
    return await rcon.send(command);
  } finally {
    await rcon.end().catch(() => {});
  }
}

/** Parse Minecraft's `list` output: "There are N of a max of M players online: a, b". */
export function parsePlayerList(raw: string): { online: number; max: number; sample: string[] } {
  const m = raw.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)/i);
  if (!m) return { online: 0, max: 0, sample: [] };
  const sample = (m[3] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { online: Number(m[1]), max: Number(m[2]), sample };
}

export async function queryPlayers(
  host: string,
  port: number,
  password: string,
): Promise<{ online: number; max: number; sample: string[] } | null> {
  try {
    const raw = await sendRcon(host, port, password, "list");
    return parsePlayerList(raw);
  } catch (e) {
    if (config.logLevel === "debug") logger.debug({ e }, "rcon player query failed");
    return null;
  }
}
