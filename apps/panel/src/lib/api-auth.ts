import "server-only";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "@prisma/client";
import { hasScope, type Scope } from "@mgg/shared";
import { db } from "./db";
import { env } from "./env";
import { sha256, randomString, constantTimeEqual } from "./crypto";
import { clientIp } from "./ratelimit";
import { HttpError } from "./auth";

const secret = () => new TextEncoder().encode(env.apiJwtSecret);

export interface ApiPrincipal {
  user: User;
  scopes: string[];
  via: "apikey" | "session";
}

// ── launcher session / refresh tokens (device-code flow output) ──────────
export async function issueSessionToken(userId: string, scopes: string[]): Promise<string> {
  return new SignJWT({ scopes, typ: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret());
}

export async function issueRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyRefreshToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret());
  if (payload.typ !== "refresh" || !payload.sub) throw new HttpError(401, "invalid refresh token");
  return payload.sub as string;
}

// ── API key generation ───────────────────────────────────────────────────
export interface GeneratedKey {
  prefix: string;
  fullKey: string;
  keyHash: string;
}
export function generateApiKey(admin = false): GeneratedKey {
  const head = admin ? "aeths" : "aeth";
  const pub = randomString(8);
  const secretPart = randomString(32);
  const prefix = `${head}_${pub}`;
  const fullKey = `${prefix}_${secretPart}`;
  return { prefix, fullKey, keyHash: sha256(fullKey) };
}

// ── unified authentication for /api/v1 ────────────────────────────────────
export async function authApi(req: Request): Promise<ApiPrincipal> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing bearer token");

  if (token.startsWith("aeth_") || token.startsWith("aeths_")) {
    const parts = token.split("_");
    const prefix = `${parts[0]}_${parts[1]}`;
    const record = await db.apiKey.findUnique({ where: { prefix }, include: { user: true } });
    if (!record || !constantTimeEqual(record.keyHash, sha256(token))) throw new HttpError(401, "Invalid API key");
    if (record.expiresAt && record.expiresAt < new Date()) throw new HttpError(401, "API key expired");
    // optional IP allowlist (uses the trusted client IP, not a spoofable XFF)
    const allow = (record.ipAllowlist as string[]) ?? [];
    if (allow.length) {
      const ip = clientIp(req.headers);
      if (!allow.includes(ip)) throw new HttpError(403, "IP not allowed for this key");
    }
    db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return { user: record.user, scopes: (record.scopes as string[]) ?? [], via: "apikey" };
  }

  // otherwise: launcher session JWT
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "session" || !payload.sub) throw new Error("bad token type");
    const user = await db.user.findUnique({ where: { id: payload.sub as string } });
    if (!user) throw new Error("user gone");
    return { user, scopes: (payload.scopes as string[]) ?? [], via: "session" };
  } catch {
    throw new HttpError(401, "Invalid session token");
  }
}

export function requireApiScope(principal: ApiPrincipal, scope: Scope): void {
  // owners (full server access) still need the scope present on the token/key
  if (!hasScope(principal.scopes, scope)) throw new HttpError(403, `Token missing scope: ${scope}`);
}
