import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { env } from "@/lib/env";
import { sha256, constantTimeEqual } from "@/lib/crypto";
import { hasScope, ALL_SCOPES, type Scope } from "@mgg/shared";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

/**
 * Called by the daemon's SFTP server to validate a login. Authenticated with
 * the node Bearer token. Username format: "<username>.<serverId>".
 * Returns the effective scopes so the daemon can enforce read-only access.
 */
export const POST = route(async (req) => {
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // constant-time, length-equalised comparison of the high-value node token
  if (!presented || !constantTimeEqual(sha256(presented), sha256(env.daemonToken))) {
    throw new HttpError(401, "unauthorized node");
  }

  const { username, password } = schema.parse(await req.json());
  const dot = username.lastIndexOf(".");
  if (dot < 1) throw new HttpError(400, "username must be <user>.<serverId>");
  const uname = username.slice(0, dot);
  const serverId = username.slice(dot + 1);

  const user = await db.user.findUnique({ where: { username: uname } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, "invalid credentials");

  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { subusers: { where: { userId: user.id } } },
  });
  if (!server) throw new HttpError(404, "server not found");

  const isPrivileged = server.ownerId === user.id || user.role === "ADMIN";
  const scopes: string[] = isPrivileged ? [...ALL_SCOPES] : ((server.subusers[0]?.scopes as string[]) ?? []);

  if (!hasScope(scopes, "file.sftp" as Scope)) throw new HttpError(403, "no SFTP permission");
  await audit("sftp.login", { userId: user.id, serverId });

  return json({ serverId, writable: hasScope(scopes, "file.write" as Scope), deletable: hasScope(scopes, "file.delete" as Scope) });
});
