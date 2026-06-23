import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext } from "@/lib/access";
import { audit } from "@/lib/audit";
import { caddyConfigured } from "@/lib/reverse-proxy";
import { validateHostname, normaliseHostname } from "@/lib/domain-verify";

export const dynamic = "force-dynamic";

/** List this server's custom domains + the DNS target and the ports it can proxy to. */
export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);

  const domains = await db.customDomain.findMany({
    where: { serverId: c.server.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, hostname: true, targetPort: true, status: true, lastError: true, verifiedAt: true },
  });

  const ports = c.allocations
    .map((a) => ({ port: a.port, role: a.role, primary: a.primary }))
    .sort((a, b) => (a.primary === b.primary ? a.port - b.port : a.primary ? -1 : 1));

  return json({
    configured: caddyConfigured(),
    target: c.node.publicIp, // the A record customers must point at
    ports,
    domains,
  });
});

const schema = z.object({
  hostname: z.string().min(1).max(253),
  targetPort: z.coerce.number().int().optional(),
});

/** Claim a custom domain for this server (owner only). Stored pending verification. */
export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can add a custom domain.");
  if (!caddyConfigured()) throw new HttpError(503, "The integrated reverse proxy is not enabled on this platform.");

  const body = schema.parse(await req.json());
  const hostname = normaliseHostname(body.hostname);
  const err = validateHostname(hostname);
  if (err) throw new HttpError(422, err);

  // The proxy target must be one of THIS server's own ports — never an arbitrary
  // host:port (which would turn the panel into an open relay).
  const primary = c.allocations.find((a) => a.primary) ?? c.allocations[0];
  if (!primary) throw new HttpError(400, "This server has no allocated port to proxy to.");
  const targetPort = body.targetPort ?? primary.port;
  const targetAlloc = c.allocations.find((a) => a.port === targetPort);
  if (!targetAlloc) throw new HttpError(422, "You can only proxy to one of this server's own ports.");
  // Reverse-proxying is HTTP(S) only — refuse non-HTTP roles (RCON/Query) so we
  // can't expose a raw control/query protocol over public HTTPS.
  if (["rcon", "query"].includes(targetAlloc.role.toLowerCase())) {
    throw new HttpError(422, `Port ${targetPort} is a ${targetAlloc.role} port, not a web service — pick an HTTP/map port.`);
  }

  // Global uniqueness, but only for ACTIVE (verified) domains: an unverified
  // pending claim must never let one tenant squat a hostname another owns.
  const existing = await db.customDomain.findUnique({ where: { hostname } });
  if (existing) {
    if (existing.status === "active") throw new HttpError(409, "That domain is already connected to a server.");
    await db.customDomain.delete({ where: { id: existing.id } }); // reclaim a stale/unverified claim
  }

  const created = await db.customDomain.create({
    data: { hostname, serverId: c.server.id, targetPort, status: "pending" },
    select: { id: true, hostname: true, targetPort: true, status: true },
  });
  await audit("customdomain.add", { userId: user.id, serverId: c.server.id, metadata: { hostname } });

  return json({ ...created, target: c.node.publicIp }, 201);
});
