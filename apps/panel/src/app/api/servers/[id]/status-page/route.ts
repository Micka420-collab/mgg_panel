import { z } from "zod";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertScope } from "@/lib/access";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

/** Current public-status token (null = disabled). */
export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.read");
  const s = await db.server.findUnique({ where: { id: c.server.id }, select: { statusToken: true } });
  return json({ token: s?.statusToken ?? null });
});

/** Enable (generate a token) or disable (clear) the public status page. */
export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "settings.rename");
  const { enabled } = schema.parse(await req.json());
  const token = enabled ? crypto.randomBytes(9).toString("base64url") : null;
  await db.server.update({ where: { id: c.server.id }, data: { statusToken: token } });
  return json({ token });
});
