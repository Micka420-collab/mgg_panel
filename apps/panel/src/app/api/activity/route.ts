import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

async function userServerIds(userId: string): Promise<string[]> {
  const [owned, sub] = await Promise.all([
    db.server.findMany({ where: { ownerId: userId }, select: { id: true } }),
    db.subuser.findMany({ where: { userId }, select: { serverId: true } }),
  ]);
  return [...new Set([...owned.map((s) => s.id), ...sub.map((s) => s.serverId)])];
}

/** Activity / audit log. Admins see everything; users see their own actions + their servers'. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? undefined;
  const serverId = url.searchParams.get("serverId") ?? undefined;
  const take = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 300);

  const or = isAdmin ? undefined : [{ userId: user.id }, { serverId: { in: await userServerIds(user.id) } }];
  const where: any = {};
  if (or) where.OR = or;
  if (action) where.action = action;
  if (serverId) where.serverId = serverId;

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { username: true } }, server: { select: { name: true } } },
  });

  // Distinct action names (for the filter dropdown), scoped the same way.
  const actionRows = await db.auditLog.findMany({
    where: or ? { OR: or } : {},
    select: { action: true },
    distinct: ["action"],
    take: 100,
  });

  return json({
    actions: actionRows.map((a) => a.action).sort(),
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      user: l.user?.username ?? null,
      server: l.server?.name ?? null,
      serverId: l.serverId,
      metadata: l.metadata,
      ip: l.ip,
      createdAt: l.createdAt,
    })),
  });
});
