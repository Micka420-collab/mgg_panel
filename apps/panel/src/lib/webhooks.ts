import "server-only";
import crypto from "node:crypto";
import { db } from "./db";

/**
 * Outbound webhook delivery.
 *
 * Webhooks let owners subscribe external systems to server lifecycle events
 * (e.g. server.started, server.errored, backup.created). Each delivery POSTs a
 * JSON body `{ event, ts, data }` to the configured URL, best-effort, with a
 * short timeout and an optional HMAC-SHA256 signature so the receiver can
 * verify authenticity.
 */

const TIMEOUT_MS = 5000;

export interface EmitOptions {
  /** Match webhooks scoped to this server (plus account-wide ones for the owner). */
  serverId?: string;
  /** Match account-wide webhooks owned by this user. */
  ownerId?: string;
}

/** The JSON envelope every receiver gets. */
export interface WebhookEnvelope {
  event: string;
  ts: string;
  data: Record<string, unknown>;
}

/**
 * Compute the value of the `X-MGG-Signature` header for a payload.
 * Format: `sha256=<hex>` over the exact serialized request body, keyed by the
 * webhook secret. Mirrors the convention used by GitHub/Stripe-style webhooks.
 */
export function signPayload(secret: string, body: string): string {
  const mac = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${mac}`;
}

/**
 * Deliver a single webhook. Never throws — resolves to whether the POST
 * appeared to succeed (2xx). Aborts after TIMEOUT_MS.
 */
async function deliver(
  target: { url: string; secret: string | null },
  envelope: WebhookEnvelope,
): Promise<boolean> {
  const body = JSON.stringify(envelope);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "MGG-Webhooks/1",
    "X-MGG-Event": envelope.event,
  };
  if (target.secret) headers["X-MGG-Signature"] = signPayload(target.secret, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      // Never follow redirects to an attacker-chosen location.
      redirect: "manual",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load all active webhooks matching the given event + scope and fan out a
 * delivery to each. Best-effort: failures are swallowed so a misconfigured
 * endpoint can never break the action that emitted the event.
 *
 * Matching rules:
 *  - The webhook must be `active`.
 *  - The webhook's `events` array must contain `event` or the wildcard `"*"`.
 *  - Scope: a webhook bound to `serverId` matches that server; a webhook with a
 *    null `serverId` (account-wide) matches any event for its owner.
 */
export async function emitWebhook(
  event: string,
  payload: Record<string, unknown>,
  opts: EmitOptions = {},
): Promise<void> {
  try {
    const { serverId, ownerId } = opts;

    // Build the scope filter: server-bound hooks for this server, plus
    // account-wide hooks owned by the relevant owner.
    const or: Array<{ serverId?: string | null; ownerId?: string }> = [];
    if (serverId) or.push({ serverId });
    if (ownerId) or.push({ serverId: null, ownerId });
    if (or.length === 0) return;

    const candidates = await db.webhook.findMany({
      where: { active: true, OR: or },
      select: { id: true, url: true, secret: true, events: true },
    });
    if (candidates.length === 0) return;

    const envelope: WebhookEnvelope = {
      event,
      ts: new Date().toISOString(),
      data: payload,
    };

    const matching = candidates.filter((w) => {
      const events = Array.isArray(w.events) ? (w.events as unknown[]) : [];
      return events.includes(event) || events.includes("*");
    });

    await Promise.allSettled(
      matching.map((w) => deliver({ url: w.url, secret: w.secret }, envelope)),
    );
  } catch {
    // Webhook emission is strictly best-effort.
  }
}
