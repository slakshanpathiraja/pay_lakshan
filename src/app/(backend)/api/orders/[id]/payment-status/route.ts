import { PAYMENT_TRANSITIONS, type PaymentStatus } from "@/lib/commerce";
import { route } from "@/server/api/route";
import { START_PERIOD, STOP_PERIOD } from "@/server/commerce";
import { withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { stopStripeBilling } from "@/server/stripe";

/**
 * pending → paid / failed · failed → paid / pending · paid → refunded.
 * Paying a pending order starts it (a period from now); refunding cancels it. Marked paid or
 * refunded by hand, its open Stripe payment link stops working (so it isn't paid twice).
 */
export const PATCH = route(
  "orders.updatePayment",
  async ({ req, scope, params, body }) => {
    const order = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        payment_status: PaymentStatus;
        order_status: string;
        order_number: string;
        platform_id: string;
        checkout_session_id: string | null;
      }>(
        `SELECT payment_status, order_status, order_number, platform_id, checkout_session_id
         FROM orders WHERE id = $1 AND platform_id = $2 FOR UPDATE`,
        [params.id, scope.platformId],
      );
      const order = rows[0];
      if (!order) throw new ApiError(404, "NOT_FOUND");
      if (!PAYMENT_TRANSITIONS[order.payment_status].includes(body.status)) {
        throw new ApiError(409, "PAYMENT_STATUS_INVALID");
      }
      if (
        (body.status === "paid" || body.status === "refunded") &&
        order.checkout_session_id
      ) {
        await stopStripeBilling({ ...order, stripe_subscription_id: null });
        await client.query(
          "UPDATE orders SET checkout_session_id = NULL, pay_url = NULL, pay_url_expires_at = NULL WHERE id = $1",
          [params.id],
        );
      }
      if (body.status === "paid") {
        await client.query(
          "UPDATE orders SET payment_status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1",
          [params.id],
        );
        if (order.order_status === "pending") {
          await client.query(
            `UPDATE orders o SET order_status = 'active', ${START_PERIOD} WHERE o.id = $1`,
            [params.id],
          );
        }
      } else if (body.status === "refunded") {
        await client.query(
          `UPDATE orders o SET payment_status = 'refunded', order_status = 'cancelled', ${STOP_PERIOD},
                updated_at = now()
          WHERE o.id = $1`,
          [params.id],
        );
      } else {
        await client.query(
          "UPDATE orders SET payment_status = $1::varchar, updated_at = now() WHERE id = $2",
          [body.status, params.id],
        );
      }
      return order;
    });
    return json({
      id: params.id,
      message: messageFor(req, "notices.paymentStatusChanged", {
        number: order.order_number,
        status: messageFor(req, `orders.payment.${body.status}`),
      }),
    });
  },
);
