import crypto from "node:crypto";
import { env } from "./env";

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function randomString(len = 24): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i]! % alphabet.length];
  return out;
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Keyed HMAC-SHA256 (hex). Used for recovery codes / API keys so a DB dump
 *  cannot be brute-forced without also stealing AUTH_SECRET. */
export function hmac(input: string): string {
  return crypto.createHmac("sha256", env.authSecret).update(input).digest("hex");
}

/** A short human-friendly code like "AB12-CD34" for device-auth user codes. */
export function userCode(): string {
  const a = randomString(4).toUpperCase();
  const b = randomString(4).toUpperCase();
  return `${a}-${b}`;
}

// AES-256-GCM symmetric encryption for secrets at rest (TOTP secrets, etc.).
// The key is derived from AUTH_SECRET with HKDF-SHA256 + a domain-separation
// label (so it never collides with session/JWT use). Ciphertext is versioned.
const ENC_VERSION = "v1";
function aesKey(): Buffer {
  const salt = Buffer.from("mgg-kdf-salt-v1");
  const info = Buffer.from("mgg-secret-encryption-v1");
  return Buffer.from(crypto.hkdfSync("sha256", env.authSecret, salt, info, 32));
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_VERSION}.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  // versioned format: v1.<iv>.<tag>.<data>
  const [version, ivB, tagB, dataB] = parts.length === 4 ? parts : ["", ...parts];
  if (version !== ENC_VERSION || !ivB || !tagB || !dataB) throw new Error("bad ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
