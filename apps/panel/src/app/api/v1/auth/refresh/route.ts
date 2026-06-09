import { z } from "zod";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { verifyRefreshToken, issueSessionToken } from "@/lib/api-auth";
import { ALL_SCOPES } from "@mgg/shared";
import { HttpError } from "@/lib/auth";

const schema = z.object({ refresh_token: z.string().min(1) });

export const POST = route(async (req) => {
  const { refresh_token } = schema.parse(await req.json());
  const userId = await verifyRefreshToken(refresh_token);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, "Account no longer exists");
  const scopes = [...ALL_SCOPES];
  const access_token = await issueSessionToken(user.id, scopes);
  return json({ token_type: "Bearer", access_token, expires_in: 3600, scope: scopes.join(" ") });
});
