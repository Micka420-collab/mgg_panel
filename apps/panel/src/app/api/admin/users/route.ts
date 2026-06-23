import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Admin: list every account with role, status and usage counts. */
export const GET = route(async () => {
  const me = await requireAdmin();
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, username: true, email: true, role: true, suspended: true,
      totpEnabled: true, credits: true, createdAt: true,
      _count: { select: { servers: true, subusers: true } },
    },
  });
  return json({
    me: me.id,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      suspended: u.suspended,
      totpEnabled: u.totpEnabled,
      credits: u.credits,
      createdAt: u.createdAt,
      servers: u._count.servers,
      subuserOf: u._count.subusers,
    })),
  });
});
