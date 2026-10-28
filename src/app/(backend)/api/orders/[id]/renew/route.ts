import { route } from "@/server/api/route";
import { afterPeriod, ORDER_STATE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";

/**
 * Paid subscriptions that are active or expired: one more period from the end (or from now
 * when it already ended); an expired one becomes active again. Not for Stripe subscriptions:
 * Stripe (and Google Play) renew those themselves (their webhooks move the end date).
 */
export const POST = route("orders.renew", async ({ req, scope, params }) => {
  const { rows } = await query<{
    state: string;
    payment_status: string;
    billing: string;
    order_number: string;
    stripe_subscription_id: string | null;
    google_purchase_token: string | null;
  }>(
    `SELECT ${ORDER_STATE} AS state, o.payment_status, o.billing, o.order_number, o.stripe_subscription_id,
            o.google_purchase_token
       FROM orders o WHERE o.id = $1 AND o.platform_id = $2`,
    [params.id, scope.platformId],
  );
  const order = rows[0];
  if (!order) throw new ApiError(404, "NOT_FOUND");
  if (order.billing !== "recurring") throw new ApiError(409, "NOT_RENEWABLE");
  if (order.stripe_subscription_id)
    throw new ApiError(409, "STRIPE_SUBSCRIPTION_BILLED");
  if (order.google_purchase_token) throw new ApiError(409, "GOOGLE_PLAY_BILLED");
  if (order.payment_status !== "paid")
    throw new ApiError(409, "ORDER_NOT_PAID");
  if (order.state !== "active" && order.state !== "expired")
    throw new ApiError(409, "ORDER_STATUS_INVALID");
  const { rows: renewed } = await query<{ ends_at: string }>(
    `UPDATE orders AS o SET order_status = 'active', ends_at = ${afterPeriod("MAX(COALESCE(o.ends_at, now()), now())")},
            updated_at = now()
      WHERE o.id = $1 RETURNING ends_at`,
    [params.id],
  );
  return json({
    id: params.id,
    ends_at: renewed[0].ends_at,
    message: messageFor(req, "notices.orderRenewed", {
      number: order.order_number,
    }),
  });
});
