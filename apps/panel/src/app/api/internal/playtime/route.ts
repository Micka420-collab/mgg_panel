import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { HttpError } from "@/lib/auth";
import { sha256, constantTimeEqual } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const schema = z.object({
  serverId: z.string().min(1).max(64),
  steamId: z.string().regex(/^\d{17}$/),
  name: z.string().min(1).max(64),
  seconds: z.number().int().min(0).max(86400),
});

/**
 * Internal endpoint — the daemon reports a finished play session (on a player
 * disconnect). Accumulates per-player playtime for the leaderboard. Auth via the
 * shared DAEMON_TOKEN.
 */
export const POST = route(async (req) => {
  const auth = (await headers()).get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !constantTimeEqual(sha256(token), sha256(process.env.DAEMON_TOKEN ?? ""))) throw new HttpError(401, "unauthorized");

  const b = schema.parse(await req.json());
  if (b.seconds <= 0) return json({ ok: true });
  await db.playtimeStat.upsert({
    where: { serverId_steamId: { serverId: b.serverId, steamId: b.steamId } },
    update: {
      totalSeconds: { increment: b.seconds },
      sessions: { increment: 1 },
      name: b.name,
      lastSeenAt: new Date(),
    },
    create: { serverId: b.serverId, steamId: b.steamId, name: b.name, totalSeconds: b.seconds, sessions: 1 },
  });
  return json({ ok: true });
});
