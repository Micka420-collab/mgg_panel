import { z } from "zod";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return json({ user: null }, 401);
  return json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      totpEnabled: user.totpEnabled,
      credits: user.credits,
      avatarUrl: user.avatarUrl,
      emailNotifications: user.emailNotifications,
    },
  });
});

const patchSchema = z.object({ emailNotifications: z.boolean() });

/** Update the current user's preferences (email notifications opt-in/out). */
export const PATCH = route(async (req) => {
  const user = await requireUser();
  const b = patchSchema.parse(await req.json());
  await db.user.update({ where: { id: user.id }, data: { emailNotifications: b.emailNotifications } });
  return json({ ok: true, emailNotifications: b.emailNotifications });
});
