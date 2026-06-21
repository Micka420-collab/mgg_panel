import { z } from "zod";
import { headers } from "next/headers";
import { requireAdmin, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { hit, clientIp } from "@/lib/ratelimit";
import {
  SETTING_ANTHROPIC_KEY,
  SETTING_OPENROUTER_KEY,
  SETTING_AI_PROVIDER,
  SETTING_AI_MODEL,
  setSecretSetting,
  deleteSetting,
  getAiConfig,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from "@/lib/settings";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Mask a long API key to a harmless fingerprint (keys are always >12 chars). */
function mask(key: string): string {
  const k = key.trim();
  if (k.length <= 12) return "…";
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

function statusBody(cfg: Awaited<ReturnType<typeof getAiConfig>>, validationWarning?: string) {
  return {
    provider: cfg.provider, // "anthropic" | "openrouter"
    model: cfg.model,
    configured: !!cfg.key,
    source: cfg.source, // "db" | "env" | null
    masked: cfg.key ? mask(cfg.key) : null,
    defaults: { anthropic: DEFAULT_ANTHROPIC_MODEL, openrouter: DEFAULT_OPENROUTER_MODEL },
    validationWarning,
  };
}

/** Current AI Copilot status for the admin card (never returns the secret). */
export const GET = route(async () => {
  await requireAdmin();
  return json(statusBody(await getAiConfig()));
});

const putSchema = z.object({
  provider: z.enum(["anthropic", "openrouter"]),
  apiKey: z.string().min(8).max(400).optional(),
  model: z.string().max(160).optional(),
});

/**
 * Set the AI Copilot backend from the dashboard — provider (Anthropic or
 * OpenRouter), an optional API key (validated + stored AES-256-GCM encrypted)
 * and an optional model id. Sending the provider/model without a key just
 * switches backend (the existing key for that provider stays).
 */
export const PUT = route(async (req) => {
  const admin = await requireAdmin();
  // Each PUT with a key makes a real provider call to validate — cap attempts.
  const rl = hit(`admin-ai:${admin.id}:${clientIp(await headers())}`, 15, 3_600_000);
  if (!rl.ok) throw new HttpError(429, `Too many attempts. Try again in ${rl.retryAfter}s.`);

  const body = putSchema.parse(await req.json());
  const provider = body.provider;

  // Always persist the chosen provider + (if given) model.
  await setSecretSetting(SETTING_AI_PROVIDER, provider);
  if (body.model && body.model.trim()) await setSecretSetting(SETTING_AI_MODEL, body.model.trim());

  let validationWarning: string | undefined;
  if (body.apiKey && body.apiKey.trim()) {
    const key = body.apiKey.trim();
    if (provider === "anthropic") {
      if (!key.startsWith("sk-ant-")) {
        throw new HttpError(400, 'That doesn\'t look like an Anthropic API key (it should start with "sk-ant-").');
      }
      const ok = await validateAnthropicKey(key);
      await setSecretSetting(SETTING_ANTHROPIC_KEY, key);
      if (!ok) validationWarning = "Enregistrée, mais Anthropic était injoignable : clé non testée en direct.";
    } else {
      const ok = await validateOpenRouterKey(key);
      await setSecretSetting(SETTING_OPENROUTER_KEY, key);
      if (!ok) validationWarning = "Enregistrée, mais OpenRouter était injoignable : clé non testée en direct.";
    }
    await audit("admin.ai.key.set", { userId: admin.id, metadata: { provider } });
  } else {
    await audit("admin.ai.provider.set", { userId: admin.id, metadata: { provider, model: body.model ?? null } });
  }

  return json(statusBody(await getAiConfig(), validationWarning));
});

/**
 * Remove a stored key. `?provider=anthropic|openrouter` clears that one;
 * omitted clears both. The Copilot then falls back to env keys, then rules.
 */
export const DELETE = route(async (req) => {
  const admin = await requireAdmin();
  const which = new URL(req.url).searchParams.get("provider");
  if (which === "openrouter") await deleteSetting(SETTING_OPENROUTER_KEY);
  else if (which === "anthropic") await deleteSetting(SETTING_ANTHROPIC_KEY);
  else {
    await deleteSetting(SETTING_ANTHROPIC_KEY);
    await deleteSetting(SETTING_OPENROUTER_KEY);
  }
  await audit("admin.ai.key.clear", { userId: admin.id, metadata: { provider: which ?? "all" } });
  return json(statusBody(await getAiConfig()));
});

/**
 * Cheap 1-token call to confirm Anthropic accepts the key. Only a hard auth
 * failure (401/403) blocks saving; transient errors don't.
 */
async function validateAnthropicKey(key: string): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(400, "Anthropic a rejeté cette clé (401/403). Vérifie-la et réessaie.");
    }
    return true;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.debug("[admin/ai] anthropic key validation unreachable; saving untested:", e instanceof Error ? e.message : e);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Confirm OpenRouter accepts the key via its lightweight /key endpoint. Only a
 * hard auth failure (401/403) blocks saving; transient errors don't.
 */
async function validateOpenRouterKey(key: string): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { authorization: `Bearer ${key}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(400, "OpenRouter a rejeté cette clé (401/403). Vérifie-la et réessaie.");
    }
    return true;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.debug("[admin/ai] openrouter key validation unreachable; saving untested:", e instanceof Error ? e.message : e);
    return false;
  } finally {
    clearTimeout(t);
  }
}
