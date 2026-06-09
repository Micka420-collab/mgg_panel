import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { env } from "@/lib/env";
import {
  getStripe,
  stripeConfigured,
  eurToCredits,
  CREDITS_PER_EUR,
  MIN_TOPUP_EUR,
  MAX_TOPUP_EUR,
} from "@/lib/stripe";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  amountEur: z.number().finite().min(MIN_TOPUP_EUR).max(MAX_TOPUP_EUR),
});

/**
 * Create a Stripe Checkout Session to top up the credit wallet with a real
 * card payment. The wallet is only credited later, from the verified
 * `checkout.session.completed` webhook — never here.
 *
 * Returns { url } for the browser to redirect to. When Stripe is not
 * configured every call gets a clean 503 instead of a crash.
 */
export const POST = route(async (req) => {
  const user = await requireUser();

  if (!stripeConfigured()) {
    throw new HttpError(503, "Payments are not configured");
  }

  const { amountEur } = schema.parse(await req.json().catch(() => ({})));
  // Stripe charges in the smallest currency unit (cents).
  const amountCents = Math.round(amountEur * 100);
  const credits = eurToCredits(amountEur);

  const base = env.appUrl.replace(/\/+$/, "");
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Stripe will collect/create a customer email so receipts are sent.
    customer_email: user.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amountCents,
          product_data: {
            name: `${credits.toLocaleString()} MGG credits`,
            description: `Wallet top-up · ${CREDITS_PER_EUR} credits per €1`,
          },
        },
      },
    ],
    // Carried verbatim into the webhook event so we know who to credit and how
    // much, without trusting the client. We also reconcile against amount_total.
    metadata: {
      userId: user.id,
      credits: String(credits),
      kind: "wallet_topup",
    },
    success_url: `${base}/dashboard/billing?topup=success`,
    cancel_url: `${base}/dashboard/billing?topup=cancelled`,
  });

  await audit("billing.checkout.create", {
    userId: user.id,
    metadata: { amountEur, credits, sessionId: session.id },
  });

  if (!session.url) {
    throw new HttpError(502, "Stripe did not return a checkout URL");
  }
  return json({ url: session.url });
});
