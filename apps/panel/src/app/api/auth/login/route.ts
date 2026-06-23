import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSession, getDummyHash, HttpError } from "@/lib/auth";
import { lockedFor, recordFailure, resetFailures, LOGIN_POLICY } from "@/lib/lockout";
import { json, route } from "@/lib/http";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = route(async (req) => {
  const { email, password } = schema.parse(await req.json());
  const key = email.toLowerCase();

  const wait = lockedFor(`login:${key}`);
  if (wait) throw new HttpError(429, `Too many attempts. Try again in ${wait}s.`);

  const user = await db.user.findUnique({ where: { email: key } });
  // Always run bcrypt (against a dummy hash if no user) so timing doesn't reveal
  // whether the email exists.
  const hash = user?.passwordHash ?? (await getDummyHash());
  const ok = await verifyPassword(password, hash);

  if (!user || !ok) {
    recordFailure(`login:${key}`, LOGIN_POLICY);
    throw new HttpError(401, "Invalid email or password");
  }
  resetFailures(`login:${key}`);

  // Suspended accounts are blocked (admin moderation).
  if (user.suspended) throw new HttpError(403, "Ce compte est suspendu. Contacte un administrateur.");

  await createSession(user.id, !user.totpEnabled);
  await audit("user.login", { userId: user.id, metadata: { needs2fa: user.totpEnabled } });

  return json({ ok: true, needs2fa: user.totpEnabled, role: user.role });
});
