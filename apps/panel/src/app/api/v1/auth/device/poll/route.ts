import { z } from "zod";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { issueSessionToken, issueRefreshToken } from "@/lib/api-auth";
import { ALL_SCOPES } from "@mgg/shared";

const schema = z.object({ device_code: z.string().min(1) });

export const POST = route(async (req) => {
  const { device_code } = schema.parse(await req.json());
  const record = await db.deviceAuth.findUnique({ where: { deviceCode: device_code } });

  if (!record) return json({ error: "invalid_grant" }, 400);
  if (record.expiresAt < new Date()) {
    await db.deviceAuth.delete({ where: { id: record.id } }).catch(() => {});
    return json({ error: "expired_token" }, 400);
  }
  if (!record.approved || !record.userId) {
    return json({ status: "authorization_pending" }, 202);
  }

  const user = await db.user.findUnique({ where: { id: record.userId } });
  if (!user) return json({ error: "invalid_grant" }, 400);

  // The user is authorizing their OWN launcher for their OWN servers, so grant the
  // full scope set (getServerContext still limits access to their servers).
  // A future consent screen could let them narrow this per device.
  const scopes = [...ALL_SCOPES];
  const access_token = await issueSessionToken(user.id, scopes);
  const refresh_token = await issueRefreshToken(user.id);
  await db.deviceAuth.delete({ where: { id: record.id } }).catch(() => {});

  const mc = await db.oAuthAccount.findFirst({ where: { userId: user.id, provider: "microsoft" } });
  return json({
    token_type: "Bearer",
    access_token,
    refresh_token,
    expires_in: 3600,
    scope: scopes.join(" "),
    profile: { id: user.id, name: user.username, uuid: mc?.mcUuid ?? null, mc_name: mc?.mcUsername ?? null },
  });
});
