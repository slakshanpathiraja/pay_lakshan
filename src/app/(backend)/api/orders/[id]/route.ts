import { route } from "@/server/api/route";
import { ORDER_STATE, PAY_URL } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { stopStripeBilling } from "@/server/stripe";

/** The order with its items and the payments Stripe reported for it. */
export const GET = route("orders.get", async ({ scope, params }) => {
  const { rows } = await query(
    `SELECT o.id, o.platform_id, o.app_id, o.app_user_id, o.order_number, o.payment_status, o.currency, o.billing,
            o.interval_unit, o.interval_count, o.starts_at, o.ends_at, o.note, o.paid_at, o.created_at, o.updated_at,
            o.stripe_subscription_id, o.google_product_id, ${PAY_URL}, ${ORDER_STATE} AS status, a.name AS app_name, u.name AS user_name, u.email AS user_email
       FROM orders o
       JOIN apps a ON a.id = o.app_id
       JOIN app_users u ON u.id = o.app_user_id
      WHERE o.id = $1 AND o.platform_id = $2`,
    [params.id, scope.platformId],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
  const { rows: items } = await query<{
    quantity: number;
    unit_amount: number;
  }>(
    "SELECT id, name, quantity, unit_amount::float8 AS unit_amount FROM order_items WHERE order_id = $1 ORDER BY id",
    [params.id],
  );
  const { rows: payments } = await query(
    `SELECT id, kind, status, amount::float8 AS amount, amount_refunded::float8 AS amount_refunded, currency,
            method_type, method_details, receipt_url, failure_message, livemode, paid_at, created_at
       FROM payments WHERE order_id = $1 ORDER BY created_at DESC`,
    [params.id],
  );
  const total = items.reduce((sum, i) => sum + i.unit_amount * i.quantity, 0);
  return json({ order: { ...rows[0], total, items, payments } });
});

/** Orders that were ever paid are kept as a record; only never-paid ones can go. */
export const DELETE = route("orders.delete", async ({ scope, params }) => {
  const { rows } = await query<{
    paid_at: string | null;
    platform_id: string;
    checkout_session_id: string | null;
    stripe_subscription_id: string | null;
  }>(
    "SELECT paid_at, platform_id, checkout_session_id, stripe_subscription_id FROM orders WHERE id = $1 AND platform_id = $2",
    [params.id, scope.platformId],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
  if (rows[0].paid_at) throw new ApiError(409, "ORDER_LOCKED");
  await stopStripeBilling(rows[0]); // its payment link stops working
  await query("DELETE FROM orders WHERE id = $1", [params.id]);
  return new Response(null, { status: 204 });
});
