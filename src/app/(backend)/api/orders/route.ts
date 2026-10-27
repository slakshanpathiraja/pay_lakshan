import { route } from "@/server/api/route";
import { ORDER_STATE, PAY_URL } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { createOrder, fromTemplate } from "@/server/orders";

/**
 * Totals are computed from the items (unit price × quantity) — never stored twice; `status`
 * is the order status as shown (an active order past its end is expired).
 */
export const GET = route("orders.list", async ({ scope, query: q }) => {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT o.id, o.order_number, o.payment_status, ${ORDER_STATE} AS status, o.currency,
              o.billing, o.interval_unit, o.interval_count, o.starts_at, o.ends_at, o.note, o.paid_at, o.created_at,
              ${PAY_URL}, o.stripe_subscription_id, o.google_product_id,
              o.app_id, a.name AS app_name, o.app_user_id, u.name AS user_name, u.email AS user_email,
              (SELECT COALESCE(SUM(i.quantity * i.unit_amount), 0)::float8 FROM order_items i WHERE i.order_id = o.id) AS total,
              (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS item_count
         FROM orders o
         JOIN apps a ON a.id = o.app_id
         JOIN app_users u ON u.id = o.app_user_id
        WHERE o.platform_id = $1
          AND ($2::int IS NULL OR o.app_id = $2)
          AND ($3::text IS NULL OR o.payment_status = $3)
          AND ($5::int IS NULL OR o.app_user_id = $5)
     ) x
     WHERE ($4::text IS NULL OR x.status = $4)
     ORDER BY x.created_at DESC
     LIMIT 500`,
    [
      scope.platformId,
      scope.appId ?? null,
      q.payment ?? null,
      q.status ?? null,
      q.appUserId ?? null,
    ],
  );
  return json({ orders: rows });
});

/**
 * A new order for a user of the app (see createOrder: pending limit, payment link) — from one
 * of the app's templates (`templateId`: its item, price and billing) or custom.
 */
export const POST = route("orders.create", async ({ req, scope, body }) => {
  const details = "templateId" in body ? await fromTemplate(body.appId, { id: body.templateId }) : body;
  const created = await createOrder(
    {
      ...details,
      platformId: scope.platformId,
      appId: body.appId,
      appUserId: body.appUserId,
      note: body.note,
      createCheckout: body.createCheckout,
    },
    req,
  );
  return json(
    {
      ...created,
      message: messageFor(req, "notices.orderCreated", { number: created.order.order_number }),
    },
    201,
  );
});
