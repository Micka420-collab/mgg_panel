import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Server ids the user owns or is a sub-user of. */
async function userServerIds(userId: string): Promise<string[]> {
  const [owned, sub] = await Promise.all([
    db.server.findMany({ where: { ownerId: userId }, select: { id: true } }),
    db.subuser.findMany({ where: { userId }, select: { serverId: true } }),
  ]);
  return [...new Set([...owned.map((s) => s.id), ...sub.map((s) => s.serverId)])];
}

/** Notifications = alerts for the user's servers (admins see everything, incl. node alerts). */
export const GET = route(async (req) => {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const serverId = new URL(req.url).searchParams.get("serverId") ?? undefined;

  let where: Record<string, unknown>;
  if (isAdmin) {
    where = serverId ? { serverId } : {};
  } else {
    const ids = await userServerIds(user.id);
    const allowed = serverId ? (ids.includes(serverId) ? [serverId] : ["__none__"]) : ids;
    where = { serverId: { in: allowed.length ? allowed : ["__none__"] } };
  }

  const alerts = await db.alert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { server: { select: { name: true } }, node: { select: { name: true } } },
  });

  return json({
    unread: alerts.filter((a) => !a.readAt).length,
    notifications: alerts.map((a) => ({
      id: a.id,
      level: a.level,
      message: a.message,
      resolved: a.resolved,
      read: !!a.readAt,
      serverId: a.serverId,
      target: a.server?.name ?? a.node?.name ?? null,
      createdAt: a.createdAt,
    })),
  });
});

const patchSchema = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() });

/** Mark notifications read (by ids, or all of the user's). */
export const PATCH = route(async (req) => {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const body = patchSchema.parse(await req.json());

  const scope = isAdmin ? {} : { serverId: { in: await userServerIds(user.id) } };
  const where = body.all
    ? { ...scope, readAt: null }
    : { ...scope, id: { in: body.ids ?? [] } };

  const res = await db.alert.updateMany({ where, data: { readAt: new Date() } });
  return json({ ok: true, updated: res.count });
});
