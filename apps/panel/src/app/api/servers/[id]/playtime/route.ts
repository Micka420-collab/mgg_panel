import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertScope } from "@/lib/access";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Playtime leaderboard for a server (top players by total time). */
export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "control.console");

  const rows = await db.playtimeStat.findMany({
    where: { serverId: c.server.id },
    orderBy: { totalSeconds: "desc" },
    take: 10,
  });
  return json({
    players: rows.map((r) => ({
      name: r.name,
      steamId: r.steamId,
      totalSeconds: r.totalSeconds,
      sessions: r.sessions,
      lastSeenAt: r.lastSeenAt,
    })),
  });
});
