import "server-only";
import Stripe from "stripe";
import type pg from "pg";
import { getConfig, getAppOrigin } from "./config";
import { ApiError } from "./errors";

// One Stripe account for every platform, from the environment (STRIPE_SECRET_KEY). Orders
// are paid on a Stripe Checkout page; Stripe then calls /api/stripe/webhook (signed with
// STRIPE_WEBHOOK_SECRET) and the webhook (stripe-webhook.ts) finds the order from the
// session's metadata, updates it and records the payment.

/** Webhook events to choose when adding the endpoint in the Stripe Dashboard. */
export const STRIPE_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted",
  "charge.refunded",
] as const;

const globalForStripe = globalThis as unknown as {
  stripe?: { key: string; client: Stripe };
};

/** The Stripe client, or null when STRIPE_SECRET_KEY isn't set. */
export function stripeClient() {
  const key = getConfig().STRIPE_SECRET_KEY;
  if (!key) return null;
  if (globalForStripe.stripe?.key !== key) {
    globalForStripe.stripe = {
      key,
      client: new Stripe(key, {
        maxNetworkRetries: 2,
        appInfo: { name: "Pay Portal" },
      }),
    };
  }
  return globalForStripe.stripe.client;
}

/** A Stripe API error as an API error, with Stripe's own message as the detail. */
export function stripeError(err: unknown): never {
  if (err instanceof ApiError) throw err;
  if (err instanceof Stripe.errors.StripeError) {
    throw new ApiError(502, "STRIPE_ERROR", [err.message]);
  }
  throw err;
}

// --- payment links (Checkout Sessions) ---------------------------------------------------

interface CheckoutOrder {
  id: number;
  platform_id: string;
  app_id: number;
  order_number: string;
  payment_status: string;
  state: string;
  currency: string;
  billing: "lifetime" | "fixed_term" | "recurring";
  interval_unit: Stripe.Price.Recurring.Interval | null;
  interval_count: number | null;
  checkout_session_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  google_purchase_token: string | null;
  user_email: string | null;
}

/** `url` with `?order=…` added (and Stripe's session id on success, filled in by Stripe). */
function returnUrl(url: string, orderNumber: string, withSession: boolean) {
  const u = new URL(url);
  u.searchParams.set("order", orderNumber);
  // Stripe replaces {CHECKOUT_SESSION_ID}; the braces must stay unencoded
  return withSession ? `${u}&session_id={CHECKOUT_SESSION_ID}` : u.toString();
}

/**
 * A new Stripe Checkout page for the order (unpaid, not cancelled, not already a Stripe
 * subscription). An open older link is expired first so the customer can't pay twice.
 * Payment methods: whatever is enabled in the Stripe Dashboard (dynamic payment methods).
 * Returns null when Stripe isn't configured (no STRIPE_SECRET_KEY).
 */
export async function createCheckout(
  client: pg.PoolClient,
  orderId: number,
  origin?: string,
) {
  const { rows } = await client.query<CheckoutOrder>(
    `SELECT o.id, o.platform_id, o.app_id, o.order_number, o.payment_status, o.currency, o.billing,
            o.interval_unit, o.interval_count, o.checkout_session_id, o.stripe_customer_id,
            o.stripe_subscription_id, o.google_purchase_token, u.email AS user_email,
            CASE WHEN o.order_status = 'active' AND o.ends_at <= now() THEN 'expired' ELSE o.order_status END AS state
       FROM orders o JOIN app_users u ON u.id = o.app_user_id
      WHERE o.id = $1 FOR UPDATE OF o`,
    [orderId],
  );
  const order = rows[0];
  if (!order) throw new ApiError(404, "NOT_FOUND");
  if (order.google_purchase_token) throw new ApiError(409, "GOOGLE_PLAY_BILLED");
  if (order.stripe_subscription_id)
    throw new ApiError(409, "STRIPE_SUBSCRIPTION_BILLED");
  if (
    !["pending", "failed"].includes(order.payment_status) ||
    order.state === "cancelled"
  ) {
    throw new ApiError(409, "CHECKOUT_NOT_ALLOWED");
  }
  const stripe = stripeClient();
  if (!stripe) return null;

  try {
    if (order.checkout_session_id) {
      const old = await stripe.checkout.sessions.retrieve(
        order.checkout_session_id,
      );
      // paid a moment ago and the webhook hasn't arrived yet
      if (old.status === "complete")
        throw new ApiError(409, "PAYMENT_IN_PROGRESS");
      if (old.status === "open") await stripe.checkout.sessions.expire(old.id);
    }

    const { rows: items } = await client.query<{
      name: string;
      quantity: number;
      unit_amount: number;
    }>(
      "SELECT name, quantity, unit_amount::float8 AS unit_amount FROM order_items WHERE order_id = $1 ORDER BY id",
      [order.id],
    );
    const subscription = order.billing === "recurring";
    const metadata = {
      order_id: String(order.id),
      order_number: order.order_number,
      platform_id: order.platform_id,
      app_id: String(order.app_id),
    };

    const baseOrigin =
      getConfig().APP_URL || getConfig().HOST
        ? getAppOrigin()
        : (origin ?? getAppOrigin());

    // Stripe always comes back to our page: it reads the order's real status and sends the
    // customer on to the app's redirect for that status (App config), if it has one
    const resolveRedirect = (status: "success" | "cancelled") => `${baseOrigin}/checkout/${status}`;

    const session = await stripe.checkout.sessions.create({
      mode: subscription ? "subscription" : "payment",
      line_items: items.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: i.unit_amount,
          product_data: { name: i.name },
          ...(subscription && {
            recurring: {
              interval: order.interval_unit!,
              interval_count: order.interval_count!,
            },
          }),
        },
      })),
      client_reference_id: order.order_number,
      ...(order.stripe_customer_id
        ? { customer: order.stripe_customer_id }
        : order.user_email && { customer_email: order.user_email }),
      metadata,
      ...(subscription
        ? { subscription_data: { metadata } }
        : {
            payment_intent_data: { metadata },
            ...(!order.stripe_customer_id && {
              customer_creation: "always" as const,
            }),
          }),
      success_url: returnUrl(
        resolveRedirect("success"),
        order.order_number,
        true,
      ),
      cancel_url: returnUrl(
        resolveRedirect("cancelled"),
        order.order_number,
        false,
      ),
    });

    await client.query(
      `UPDATE orders SET checkout_session_id = $2, pay_url = $3, pay_url_expires_at = to_timestamp($4),
              updated_at = now()
        WHERE id = $1`,
      [order.id, session.id, session.url, session.expires_at],
    );
    return {
      url: session.url!,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
    };
  } catch (err) {
    stripeError(err);
  }
}

/**
 * Before an order is cancelled or deleted: its open payment link stops working and its
 * Stripe subscription (if any) is cancelled, so the customer isn't charged again.
 */
export async function stopStripeBilling(order: {
  checkout_session_id: string | null;
  stripe_subscription_id: string | null;
}) {
  if (!order.checkout_session_id && !order.stripe_subscription_id) return;
  const stripe = stripeClient();
  if (!stripe) return;
  try {
    if (order.checkout_session_id) {
      const session = await stripe.checkout.sessions.retrieve(
        order.checkout_session_id,
      );
      if (session.status === "open")
        await stripe.checkout.sessions.expire(session.id);
    }
    if (order.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(
        order.stripe_subscription_id,
      );
      if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
        await stripe.subscriptions.cancel(sub.id);
      }
    }
  } catch (err) {
    stripeError(err);
  }
}
