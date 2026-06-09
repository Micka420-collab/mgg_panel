import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, noContent, route } from "@/lib/http";
import { getServerContext } from "@/lib/access";
import { buildAddress, getTemplate } from "@mgg/shared";
import { isDnsConfigured, domainBase, validateSubdomain, fqdnFor, claimSubdomain, releaseSubdomain } from "@/lib/dns";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function isTaken(sub: string, exceptServerId: string): Promise<boolean> {
  const existing = await db.server.findUnique({ where: { subdomain: sub.toLowerCase() } });
  return !!existing && existing.id !== exceptServerId;
}

export const GET = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  const url = new URL(req.url);
  const check = url.searchParams.get("check");

  if (check !== null) {
    const err = validateSubdomain(check);
    if (err) return json({ available: false, error: err });
    if (await isTaken(check, c.server.id)) return json({ available: false, error: "Already taken" });
    return json({ available: true, fqdn: fqdnFor(check) });
  }

  return json({
    configured: isDnsConfigured(),
    base: domainBase(),
    current: c.server.subdomain,
    currentFqdn: c.server.subdomain ? fqdnFor(c.server.subdomain) : null,
  });
});

const schema = z.object({ subdomain: z.string().min(1).max(40) });

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can set the domain");
  if (!isDnsConfigured()) throw new HttpError(503, "Free domains are not enabled on this platform");

  const { subdomain } = schema.parse(await req.json());
  const sub = subdomain.toLowerCase().trim();
  const err = validateSubdomain(sub);
  if (err) throw new HttpError(422, err);
  if (await isTaken(sub, c.server.id)) throw new HttpError(409, "That subdomain is already taken");

  // primary game port + node IP drive the A/SRV records
  const tpl = getTemplate(c.server.templateId);
  const primary = c.allocations.find((a) => a.primary) ?? c.allocations[0];
  if (!primary) throw new HttpError(400, "Server has no primary allocation");

  // release the old subdomain (if any) before claiming the new one
  if (c.server.subdomain && c.server.subdomain !== sub) await releaseSubdomain(c.server.subdomain).catch(() => {});
  await claimSubdomain(sub, primary.ip, primary.port);
  await db.server.update({ where: { id: c.server.id }, data: { subdomain: sub } });
  await audit("domain.claim", { userId: user.id, serverId: c.server.id, metadata: { subdomain: sub } });

  const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary.port;
  return json({
    subdomain: sub,
    fqdn: fqdnFor(sub),
    // with SRV in place players just type the hostname
    address: defaultPort === primary.port ? fqdnFor(sub) : buildAddress(fqdnFor(sub), primary.port, defaultPort),
  });
});

export const DELETE = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can change the domain");
  if (c.server.subdomain) {
    await releaseSubdomain(c.server.subdomain).catch(() => {});
    await db.server.update({ where: { id: c.server.id }, data: { subdomain: null } });
    await audit("domain.release", { userId: user.id, serverId: c.server.id });
  }
  return noContent();
});
