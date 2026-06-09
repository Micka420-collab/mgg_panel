import { route, json } from "@/lib/http";
import { authApi, requireApiScope } from "@/lib/api-auth";
import { getServerContext, assertScope } from "@/lib/access";
import { DaemonClient, signWsToken } from "@/lib/daemon";
import { hasScope, type Scope } from "@mgg/shared";

/** Short-lived token + socket URL for the launcher to stream live console/stats. */
export const GET = route(async (req, ctx: { params: { id: string } }) => {
  const principal = await authApi(req);
  const c = await getServerContext(principal.user, ctx.params.id);
  requireApiScope(principal, "control.console");
  assertScope(c, "control.console");
  // Cap the WS token to the INTERSECTION of the token's scopes and the user's
  // actual scopes on this server (so a broad token can't exceed sub-user rights).
  const effective = c.scopes.filter((s) => hasScope(principal.scopes, s as Scope));
  const token = await signWsToken(c.node, c.server.id, effective);
  return json({ token, socket: new DaemonClient(c.node).wsUrl(c.server.id) });
});
