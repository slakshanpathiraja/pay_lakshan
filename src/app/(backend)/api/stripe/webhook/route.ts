import type Stripe from "stripe";
import { route } from "@/server/api/route";
import { ApiError, json } from "@/server/http";
import { PAY_MODES, stripeSettings, type PayMode } from "@/server/pay-mode";
import { stripeForKey } from "@/server/stripe";
import { handleStripeEvent } from "@/server/stripe-webhook";

/**
 * Called by Stripe — one URL for both accounts (normal, and *_TEST for platforms marked
 * "test"). The event's signature must match one mode's webhook secret; it is handled with
 * that mode's key and can only change orders of that mode's platforms. Nothing is read before
 * the signature checks out; errors make Stripe retry later.
 */
export const POST = route("stripe.webhook", async ({ req }) => {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const accounts = PAY_MODES.map((mode) => ({ mode, ...stripeSettings(mode) })).filter(
    (a): a is { mode: PayMode; secretKey: string; webhookSecret: string } => !!a.secretKey && !!a.webhookSecret,
  );
  if (!accounts.length) throw new ApiError(503, "STRIPE_NOT_CONFIGURED");

  let match: { mode: PayMode; stripe: Stripe; event: Stripe.Event } | null = null;
  for (const { mode, secretKey, webhookSecret } of accounts) {
    const stripe = stripeForKey(secretKey);
    try {
      match = { mode, stripe, event: stripe.webhooks.constructEvent(payload, signature, webhookSecret) };
      break;
    } catch {
      // not signed with this mode's secret
    }
  }
  if (!match) throw new ApiError(400, "STRIPE_SIGNATURE_INVALID");
  const result = await handleStripeEvent(match.stripe, match.event, match.mode);
  return json({ received: true, result });
});
