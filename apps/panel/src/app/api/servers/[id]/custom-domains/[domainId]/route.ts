import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { noContent, route } from "@/lib/http";
import { getServerContext } from "@/lib/access";
import { audit } from "@/lib/audit";
import { removeRoute } from "@/lib/reverse-proxy";

export const dynamic = "force-dynamic";

/** Disconnect a custom domain: remove its reverse-proxy route, then the record. */
export const DELETE = route(async (_req, ctx: { params: { id: string; domainId: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can remove a custom domain.");

  const domain = await db.customDomain.findUnique({ where: { id: ctx.params.domainId } });
  if (!domain || domain.serverId !== c.server.id) throw new HttpError(404, "Domain not found.");

  await removeRoute(domain.hostname);
  await db.customDomain.delete({ where: { id: domain.id } });
  await audit("customdomain.remove", { userId: user.id, serverId: c.server.id, metadata: { hostname: domain.hostname } });
  return noContent();
});
