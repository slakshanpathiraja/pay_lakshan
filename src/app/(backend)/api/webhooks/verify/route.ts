import { route } from "@/server/api/route";
import { requireApiUser, verifySignedRequest } from "@/server/app-api";
import { ORDER_STATE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";

/**
 * The signed-in user's orders in this app — id, status (pending / active / expired /
 * cancelled), when access ends (null = never) and the order template's code (which plan;
 * null for a custom order). `email` must be theirs. `registeredAt` is when their account
 * was made — an app can count a free trial from it.
 */
export const GET = route("appApi.verify", async ({ req, query: q }) => {
  const app = await verifySignedRequest(q);
  const user = await requireApiUser(req, app);
  if (q.email.trim().toLowerCase() !== user.email?.toLowerCase()) throw new ApiError(403, "FORBIDDEN");
  const { rows } = await query<{ orderId: string; status: string; expiresAt: Date | null; template: string | null }>(
    `SELECT o.order_number AS "orderId", ${ORDER_STATE} AS status, o.ends_at AS "expiresAt", t.code AS template
       FROM orders o
       LEFT JOIN order_templates t ON t.id = o.template_id
      WHERE o.app_user_id = $1 AND o.app_id = $2
      ORDER BY o.created_at DESC`,
    [user.id, app.id],
  );
  const { rows: account } = await query<{ created_at: Date }>("SELECT created_at FROM app_users WHERE id = $1", [user.id]);
  return json({ email: user.email, registeredAt: account[0].created_at, orders: rows });
});
