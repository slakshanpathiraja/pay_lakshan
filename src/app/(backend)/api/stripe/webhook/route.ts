import { route } from "@/server/api/route";
import { getConfig } from "@/server/config";
import { ApiError, json } from "@/server/http";
import { stripeClient } from "@/server/stripe";
import { handleStripeEvent } from "@/server/stripe-webhook";

/**
 * Called by Stripe — one URL for every platform (the order says which platform it is). The
 * signature is checked with STRIPE_WEBHOOK_SECRET before anything is read; errors make
 * Stripe retry later.
 */
export const POST = route("stripe.webhook", async ({ req }) => {
  const secret = getConfig().STRIPE_WEBHOOK_SECRET;
  const stripe = stripeClient();
  if (!secret || !stripe) throw new ApiError(503, "STRIPE_NOT_CONFIGURED");
  const payload = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      req.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    throw new ApiError(400, "STRIPE_SIGNATURE_INVALID");
  }
  const result = await handleStripeEvent(stripe, event);
  return json({ received: true, result });
});
