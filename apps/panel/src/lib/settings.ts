import "server-only";
import { db } from "./db";
import { encrypt, decrypt } from "./crypto";

/**
 * Instance-wide settings stored in the DB so operators can configure things from
 * the dashboard instead of editing code/.env. Secret values are encrypted at
 * rest with the same AES-256-GCM helper used for TOTP secrets.
 */

/** Well-known setting keys. */
export const SETTING_ANTHROPIC_KEY = "anthropic_api_key";
export const SETTING_OPENROUTER_KEY = "openrouter_api_key";
/** Which AI backend the Copilot uses: "anthropic" | "openrouter". */
export const SETTING_AI_PROVIDER = "ai_provider";
/** Model id for the active provider (e.g. claude-haiku-4-5-… or deepseek/deepseek-chat). */
export const SETTING_AI_MODEL = "ai_model";

/** SMTP (transactional email) settings. */
export const SETTING_SMTP_HOST = "smtp_host";
export const SETTING_SMTP_PORT = "smtp_port";
export const SETTING_SMTP_USER = "smtp_user";
export const SETTING_SMTP_PASS = "smtp_pass";
export const SETTING_SMTP_FROM = "smtp_from";
export const SETTING_SMTP_SECURE = "smtp_secure";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Resolve SMTP config (DB-first, env fallback). Returns null when no host is set (email off). */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const host = ((await getSecretSetting(SETTING_SMTP_HOST)) || process.env.SMTP_HOST || "").trim();
  if (!host) return null;
  const port = Number(((await getSecretSetting(SETTING_SMTP_PORT)) || process.env.SMTP_PORT || "587").trim()) || 587;
  const user = ((await getSecretSetting(SETTING_SMTP_USER)) || process.env.SMTP_USER || "").trim();
  const pass = ((await getSecretSetting(SETTING_SMTP_PASS)) || process.env.SMTP_PASS || "").trim();
  const from = ((await getSecretSetting(SETTING_SMTP_FROM)) || process.env.SMTP_FROM || user || "mgg@localhost").trim();
  const secureRaw = ((await getSecretSetting(SETTING_SMTP_SECURE)) || process.env.SMTP_SECURE || (port === 465 ? "true" : "false")).trim();
  return { host, port, secure: secureRaw === "true", user, pass, from };
}

export type AiProvider = "anthropic" | "openrouter";

export interface AiConfig {
  provider: AiProvider;
  /** Active API key for the chosen provider, or null if none is configured. */
  key: string | null;
  /** Model id to call. */
  model: string;
  /** Where the active key comes from. */
  source: "db" | "env" | null;
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-chat";

/** Read + decrypt a secret setting. Returns null if absent or undecryptable. */
export async function getSecretSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return decrypt(row.value);
  } catch {
    // A rotated AUTH_SECRET (the KDF input) makes old ciphertext undecryptable —
    // treat it as "unset" rather than crashing the caller, but warn so an operator
    // can tell their stored secret became inaccessible (vs. simply never set).
    console.warn(`[settings] could not decrypt "${key}" (AUTH_SECRET rotated?) — treating as unset`);
    return null;
  }
}

/** Encrypt + upsert a secret setting. */
export async function setSecretSetting(key: string, plain: string): Promise<void> {
  const value = encrypt(plain);
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Remove a setting (no-op if absent). */
export async function deleteSetting(key: string): Promise<void> {
  await db.setting.deleteMany({ where: { key } });
}

/**
 * Resolve the Anthropic API key for the AI Copilot. A key set from the dashboard
 * (DB, encrypted) takes precedence over the ANTHROPIC_API_KEY env var, so an
 * operator can enable/override the AI without redeploying. Returns the source so
 * the admin UI can show where the active key comes from.
 */
export async function getAnthropicKey(): Promise<{ key: string | null; source: "db" | "env" | null }> {
  const dbKey = (await getSecretSetting(SETTING_ANTHROPIC_KEY))?.trim();
  if (dbKey) return { key: dbKey, source: "db" };
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envKey) return { key: envKey, source: "env" };
  return { key: null, source: null };
}

async function getOpenRouterKey(): Promise<{ key: string | null; source: "db" | "env" | null }> {
  const dbKey = (await getSecretSetting(SETTING_OPENROUTER_KEY))?.trim();
  if (dbKey) return { key: dbKey, source: "db" };
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  if (envKey) return { key: envKey, source: "env" };
  return { key: null, source: null };
}

/**
 * Resolve the full AI Copilot configuration: which provider to use, its key and
 * model. The provider can be pinned explicitly (DB setting or AI_PROVIDER env);
 * otherwise we auto-pick whichever provider actually has a key (Anthropic first).
 * This lets an operator run the Copilot on OpenRouter (DeepSeek, Llama, etc.) —
 * not only Anthropic — without redeploying.
 */
export async function getAiConfig(): Promise<AiConfig> {
  const explicit = (
    (await getSecretSetting(SETTING_AI_PROVIDER))?.trim() || process.env.AI_PROVIDER?.trim()
  )?.toLowerCase();
  const model = (await getSecretSetting(SETTING_AI_MODEL))?.trim() || process.env.AI_MODEL?.trim();

  const anthropic = await getAnthropicKey();
  const openrouter = await getOpenRouterKey();

  let provider: AiProvider;
  if (explicit === "openrouter" || explicit === "anthropic") {
    provider = explicit;
  } else {
    // Not pinned → prefer whichever provider has a key (Anthropic wins ties).
    provider = !anthropic.key && openrouter.key ? "openrouter" : "anthropic";
  }

  if (provider === "openrouter") {
    return { provider, key: openrouter.key, model: model || DEFAULT_OPENROUTER_MODEL, source: openrouter.source };
  }
  return { provider: "anthropic", key: anthropic.key, model: model || DEFAULT_ANTHROPIC_MODEL, source: anthropic.source };
}
