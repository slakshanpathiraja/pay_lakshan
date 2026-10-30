import { ORDER_TRANSITIONS, type OrderStatus } from "@/lib/commerce";
import { route } from "@/server/api/route";
import { ORDER_STATE, START_PERIOD, STOP_PERIOD } from "@/server/commerce";
import { withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { playClient } from "@/server/google-play";
import { stopGooglePlayBilling } from "@/server/google-play-sync";
import { stopStripeBilling } from "@/server/stripe";

/**
 * pending → active / cancelled · active → expired / cancelled · expired → active / cancelled ·
 * cancelled → active. Active needs a paid order and starts a new period from now; expired and
 * cancelled end a running period now. (An active order past its end already counts as expired.)
 * Cancelling also stops the payment provider: the Stripe payment link stops working and a
 * Stripe or Google Play subscription is cancelled, so the customer isn't charged again.
 */
export const PATCH = route(
  "orders.updateOrderStatus",
  async ({ req, scope, params, body }) => {
    const order = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        state: OrderStatus;
        payment_status: string;
        paid_at: string | null;
        order_number: string;
        platform_id: string;
        checkout_session_id: string | null;
        stripe_subscription_id: string | null;
        app_id: number;
        billing: string;
        google_purchase_token: string | null;
        google_product_id: string | null;
      }>(
        `SELECT ${ORDER_STATE} AS state, o.payment_status, o.paid_at, o.order_number, o.platform_id,
              o.checkout_session_id, o.stripe_subscription_id, o.app_id, o.billing,
              o.google_purchase_token, o.google_product_id
         FROM orders o WHERE o.id = $1 AND o.platform_id = $2`,
        [params.id, scope.platformId],
      );
      const order = rows[0];
      if (!order) throw new ApiError(404, "NOT_FOUND");
      if (!ORDER_TRANSITIONS[order.state].includes(body.status))
        throw new ApiError(409, "ORDER_STATUS_INVALID");
      if (body.status === "active" && order.payment_status !== "paid")
        throw new ApiError(409, "ORDER_NOT_PAID");
      if (body.status === "cancelled") {
        await stopStripeBilling(order);
        if (order.google_purchase_token && order.billing === "recurring") {
          const play = await playClient(order.platform_id);
          if (!play) throw new ApiError(503, "GOOGLE_PLAY_NOT_CONFIGURED");
          await stopGooglePlayBilling(play, order);
        }
        await client.query(
          "UPDATE orders SET checkout_session_id = NULL, pay_url = NULL, pay_url_expires_at = NULL WHERE id = $1",
          [params.id],
        );
      }
      await client.query(
        `UPDATE orders AS o SET order_status = $2, updated_at = now(),
              ${body.status === "active" ? START_PERIOD : STOP_PERIOD}
        WHERE o.id = $1`,
        [params.id, body.status],
      );
      return order;
    });
    return json({
      id: params.id,
      message: messageFor(req, "notices.orderStatusChanged", {
        number: order.order_number,
        status: messageFor(req, `orders.status.${body.status}`),
      }),
    });
  },
);
