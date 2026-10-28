import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { pageLimit, paged } from "@/server/paging";

/** Payments Stripe reported (newest first), with their order and customer. Read only. */
export const GET = route("payments.list", async ({ scope, query: q }) => {
  const search = q.search ? `%${q.search.replace(/[\\%_]/g, "\\$&")}%` : null;
  const { rows } = await query(
    `SELECT p.id, p.order_id, o.order_number, o.billing, p.kind, p.status, p.amount AS amount,
            p.amount_refunded AS amount_refunded, p.currency, p.method_type, p.method_details,
            p.receipt_url, p.failure_message, p.livemode, p.reference, p.invoice_id, p.paid_at, p.created_at,
            p.app_id, a.name AS app_name, o.app_user_id, u.name AS user_name, u.email AS user_email
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       JOIN apps a ON a.id = p.app_id
       JOIN app_users u ON u.id = o.app_user_id
      WHERE p.platform_id = $1
        AND ($2 IS NULL OR p.app_id = $2)
        AND ($3 IS NULL OR p.order_id = $3)
        AND ($4 IS NULL OR p.status = $4)
        AND ($5 IS NULL OR o.order_number LIKE $5 OR u.name LIKE $5 OR u.email LIKE $5)
      ORDER BY p.created_at DESC
      ${pageLimit(q.page)}`,
    [
      scope.platformId,
      scope.appId ?? null,
      q.orderId ?? null,
      q.status ?? null,
      search,
    ],
  );
  const { items, page, hasMore } = paged(rows, q.page);
  return json({ payments: items, page, hasMore });
});
