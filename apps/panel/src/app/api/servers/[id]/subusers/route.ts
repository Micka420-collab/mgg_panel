import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext } from "@/lib/access";
import { ALL_SCOPES } from "@mgg/shared";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can manage sub-users");
  const subs = await db.subuser.findMany({
    where: { serverId: c.server.id },
    include: { user: { select: { username: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return json({
    subusers: subs.map((s) => ({ id: s.id, userId: s.userId, username: s.user.username, email: s.user.email, scopes: s.scopes })),
  });
});

const schema = z.object({
  email: z.string().email(),
  scopes: z.array(z.string()).default([]),
});

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can manage sub-users");
  const { email, scopes } = schema.parse(await req.json());

  const target = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!target) throw new HttpError(404, "No MGG account with that email");
  if (target.id === c.server.ownerId) throw new HttpError(409, "The owner already has full access");

  const valid = scopes.filter((s) => (ALL_SCOPES as readonly string[]).includes(s));
  const sub = await db.subuser.upsert({
    where: { serverId_userId: { serverId: c.server.id, userId: target.id } },
    update: { scopes: valid as object },
    create: { serverId: c.server.id, userId: target.id, scopes: valid as object },
  });
  await audit("subuser.add", { userId: user.id, serverId: c.server.id, metadata: { target: target.username } });
  return json({ id: sub.id }, 201);
});
