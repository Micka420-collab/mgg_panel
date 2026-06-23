import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext } from "@/lib/access";
import { audit } from "@/lib/audit";
import { resolvesToNode } from "@/lib/domain-verify";
import { upsertRoute, upstreamFor } from "@/lib/reverse-proxy";

export const dynamic = "force-dynamic";

/**
 * Verify a custom domain points at this node, then wire it into the reverse
 * proxy. Idempotent — safe to re-run (e.g. after fixing DNS or a Caddy restart).
 */
export const POST = route(async (_req, ctx: { params: { id: string; domainId: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can verify a custom domain.");

  const domain = await db.customDomain.findUnique({ where: { id: ctx.params.domainId } });
  if (!domain || domain.serverId !== c.server.id) throw new HttpError(404, "Domain not found.");

  const nodeIp = c.node.publicIp;
  const { ok, found } = await resolvesToNode(domain.hostname, nodeIp);

  if (!ok) {
    const lastError = found.length
      ? `Points at ${found.join(", ")} — expected ${nodeIp}.`
      : "No A record found yet (DNS can take a few minutes to propagate).";
    await db.customDomain.update({ where: { id: domain.id }, data: { status: "pending", lastError } });
    return json({ ok: false, status: "pending", found, expected: nodeIp, error: lastError });
  }

  // DNS is correct — program the proxy route. If Caddy is unreachable we keep
  // the domain "failed" with the reason rather than claiming success.
  try {
    await upsertRoute(domain.hostname, upstreamFor(nodeIp, domain.targetPort));
  } catch (e: any) {
    const lastError = e?.message ?? "Could not program the reverse proxy.";
    await db.customDomain.update({ where: { id: domain.id }, data: { status: "failed", lastError } });
    return json({ ok: false, status: "failed", error: lastError });
  }

  await db.customDomain.update({
    where: { id: domain.id },
    data: { status: "active", verifiedAt: new Date(), lastError: null },
  });
  await audit("customdomain.verify", { userId: user.id, serverId: c.server.id, metadata: { hostname: domain.hostname } });
  return json({ ok: true, status: "active", url: `https://${domain.hostname}` });
});
