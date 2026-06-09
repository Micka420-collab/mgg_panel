import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, noContent, route } from "@/lib/http";
import { getServerContext } from "@/lib/access";
import { ALL_SCOPES } from "@mgg/shared";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ scopes: z.array(z.string()) });

export const PATCH = route(async (req, ctx: { params: { id: string; uid: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can manage sub-users");
  const { scopes } = patchSchema.parse(await req.json());
  const valid = scopes.filter((s) => (ALL_SCOPES as readonly string[]).includes(s));
  const sub = await db.subuser.findFirst({ where: { serverId: c.server.id, userId: ctx.params.uid } });
  if (!sub) throw new HttpError(404, "Sub-user not found");
  await db.subuser.update({ where: { id: sub.id }, data: { scopes: valid as object } });
  return json({ ok: true });
});

export const DELETE = route(async (_req, ctx: { params: { id: string; uid: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can manage sub-users");
  await db.subuser.deleteMany({ where: { serverId: c.server.id, userId: ctx.params.uid } });
  return noContent();
});
