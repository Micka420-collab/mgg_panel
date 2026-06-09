import { route, json } from "@/lib/http";
import { authApi, requireApiScope } from "@/lib/api-auth";
import { getServerContext } from "@/lib/access";
import { DaemonClient } from "@/lib/daemon";
import { fqdnFor, isDnsConfigured } from "@/lib/dns";
import { buildAddress, getTemplate, hasScope, type ConnectionInfo, type ServerState } from "@mgg/shared";

/**
 * Everything a launcher needs to auto-join: the address/port to pass to the
 * game, plus live state, player count, version and MOTD.
 */
export const GET = route(async (req, ctx: { params: { id: string } }) => {
  const principal = await authApi(req);
  requireApiScope(principal, "allocation.read");
  const c = await getServerContext(principal.user, ctx.params.id);
  const tpl = getTemplate(c.server.templateId);
  const env = (c.server.environment as Record<string, string>) ?? {};
  const primary = c.allocations.find((a) => a.primary) ?? c.allocations[0];
  const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;

  let state = c.server.state as ServerState;
  let players: { online: number; max: number } | undefined;
  try {
    const status = await new DaemonClient(c.node).status(c.server.id);
    state = status.state;
    // player count only if the token carries players.read
    if (status.stats?.players && hasScope(principal.scopes, "players.read")) {
      players = { online: status.stats.players.online, max: status.stats.players.max };
    }
  } catch {
    /* node offline -> use cached */
  }

  // A claimed subdomain (with its SRV record) lets players connect by hostname
  // alone — prefer it as the advertised address.
  const fqdn = c.server.subdomain && isDnsConfigured() ? fqdnFor(c.server.subdomain) : null;
  const rawAddress = primary ? buildAddress(primary.ip, primary.port, defaultPort) : "";

  const info: ConnectionInfo = {
    address: fqdn ?? rawAddress,
    host: fqdn ?? primary?.ip ?? c.node.publicIp,
    port: primary?.port ?? defaultPort,
    srv: fqdn ?? undefined,
    game: c.server.game,
    state,
    players,
    version: env.VERSION,
    motd: env.MOTD,
  };
  return json(info);
});
