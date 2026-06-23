import "server-only";
import { db } from "./db";
import { DaemonClient } from "./daemon";
import { fqdnFor, isDnsConfigured } from "./dns";
import { buildAddress, getTemplate } from "@mgg/shared";

/**
 * Public, no-login view of a single server, resolved by its claimed subdomain.
 *
 * Powers the shareable mini-site at `/s/<subdomain>`. Exposes ONLY safe,
 * player-facing fields (never owner, ids, env secrets, node internals) — just
 * what someone needs to decide to join: live state, players, the connect
 * address and the public MOTD/version.
 */
export interface PublicServer {
  name: string;
  game: string;
  /** running | starting | offline | errored | … (daemon-authoritative when reachable) */
  state: string;
  online: boolean;
  players: { online: number; max: number; sample: string[] };
  /** hostname (claimed subdomain) or ip:port players connect to */
  address: string;
  motd: string | null;
  version: string | null;
  /** sleeping & wake-on-join eligible — connecting will wake it automatically */
  sleeping: boolean;
  /** safe to advertise as joinable right now */
  joinable: boolean;
}

/** Cap how long a public request will wait on the node before falling back to cached state. */
const STATUS_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export async function getPublicServer(subdomain: string): Promise<PublicServer | null> {
  const sub = (subdomain ?? "").trim();
  if (!sub || sub.length > 63) return null;

  const server = await db.server.findFirst({
    where: { subdomain: { equals: sub, mode: "insensitive" } },
    include: { node: true, allocations: true },
  });
  if (!server) return null;

  const tpl = getTemplate(server.templateId);
  const env = (server.environment as Record<string, string>) ?? {};
  const primary = server.allocations.find((a) => a.primary) ?? server.allocations[0];
  const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;
  const fqdn = server.subdomain && isDnsConfigured() ? fqdnFor(server.subdomain) : null;
  const address = fqdn ?? (primary ? buildAddress(primary.ip, primary.port, defaultPort) : "");

  let state = server.state;
  let players = { online: 0, max: 0, sample: [] as string[] };
  try {
    const status = await withTimeout(new DaemonClient(server.node).status(server.id), STATUS_TIMEOUT_MS);
    state = status.state;
    const p = status.players as { online?: number; max?: number; sample?: string[] } | null;
    if (p) {
      players = {
        online: p.online ?? 0,
        max: p.max ?? 0,
        sample: Array.isArray(p.sample) ? p.sample.slice(0, 20) : [],
      };
    }
  } catch {
    /* node unreachable / slow — fall back to the cached DB state */
  }

  const online = state === "running";
  return {
    name: server.name,
    game: server.game,
    state,
    online,
    players,
    address,
    motd: env.MOTD ?? null,
    version: env.VERSION ?? null,
    sleeping: server.autoStop && !server.suspended && !online,
    joinable: online && !server.suspended,
  };
}
