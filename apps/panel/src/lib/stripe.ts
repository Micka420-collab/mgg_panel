import "server-only";
import Stripe from "stripe";

/**
 * Thin Stripe wrapper. DORMANT BY DESIGN: when STRIPE_SECRET_KEY is unset the
 * whole feature is "not configured" and every caller gets a clean error instead
 * of a crash. This keeps the panel safe to run with no payment secrets.
 *
 * Pricing model: the wallet is denominated in *credits*. We sell credits 1:1
 * with euro cents so the maths stays trivial and auditable — €1.00 buys 100
 * credits. Tune CREDITS_PER_EUR if you want a different exchange rate.
 */

/** Credits granted per euro spent. €1 → 100 credits (1 credit = 1 euro cent). */
export const CREDITS_PER_EUR = 100;

/** Minimum / maximum top-up in euros, enforced both client- and server-side. */
export const MIN_TOPUP_EUR = 5;
export const MAX_TOPUP_EUR = 500;

const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

/** True when a real secret key is present — gate every Stripe call on this. */
export function stripeConfigured(): boolean {
  return secretKey.trim().length > 0;
}

/** True when the webhook signing secret is present. */
export function stripeWebhookConfigured(): boolean {
  return webhookSecret.trim().length > 0;
}

let _client: Stripe | null = null;

/**
 * Lazily construct the Stripe SDK client. Throws a readable error when the key
 * is missing so route handlers can surface a 503 "payments not configured".
 */
export function getStripe(): Stripe {
  if (!stripeConfigured()) {
    throw new StripeNotConfiguredError();
  }
  if (!_client) {
    _client = new Stripe(secretKey, {
      // Pin the API version for reproducible behaviour across deploys.
      apiVersion: "2024-06-20",
      appInfo: { name: "MGG", url: "https://github.com" },
      typescript: true,
    });
  }
  return _client;
}

/** Verify a webhook payload signature. Returns the parsed Stripe event. */
export function constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
  if (!stripeWebhookConfigured()) {
    throw new StripeNotConfiguredError("Stripe webhook secret not configured");
  }
  return getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
}

/** Convert a euro amount to wallet credits (whole credits only). */
export function eurToCredits(amountEur: number): number {
  return Math.round(amountEur * CREDITS_PER_EUR);
}

/** Sentinel error → mapped to HTTP 503 by the route handlers. */
export class StripeNotConfiguredError extends Error {
  constructor(message = "Payments are not configured") {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}
