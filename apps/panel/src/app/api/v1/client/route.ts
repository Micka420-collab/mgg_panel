import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { authApi, requireApiScope } from "@/lib/api-auth";
import { reconcileStates } from "@/lib/server-state";

export const dynamic = "force-dynamic";
import { getTemplate, buildAddress } from "@mgg/shared";

/** List every server the authenticated user can access (owner or sub-user). */
export const GET = route(async (req) => {
  const principal = await authApi(req);
  requireApiScope(principal, "allocation.read"); // discovery returns join addresses
  const user = principal.user;
  const servers = await db.server.findMany({
    where: { OR: [{ ownerId: user.id }, { subusers: { some: { userId: user.id } } }] },
    include: { allocations: true, node: true },
    orderBy: { createdAt: "desc" },
  });
  const states = await reconcileStates(servers);

  return json({
    servers: servers.map((s) => {
      const tpl = getTemplate(s.templateId);
      const primary = s.allocations.find((a) => a.primary) ?? s.allocations[0];
      const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;
      return {
        id: s.id,
        name: s.name,
        game: s.game,
        node: s.node.name,
        state: states.get(s.id) ?? s.state,
        address: primary ? buildAddress(primary.ip, primary.port, defaultPort) : null,
        owner: s.ownerId === user.id,
      };
    }),
  });
});
