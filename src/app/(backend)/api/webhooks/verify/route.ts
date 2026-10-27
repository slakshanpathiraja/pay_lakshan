import { route } from "@/server/api/route";
import { requireApiUser, verifySignedRequest } from "@/server/app-api";
import { ORDER_STATE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";

/**
 * The signed-in user's orders in this app — id, status (pending / active / expired /
 * cancelled) and when access ends (null = never). `email` must be theirs.
 */
export const GET = route("appApi.verify", async ({ req, query: q }) => {
  const app = await verifySignedRequest(q);
  const user = await requireApiUser(req, app);
  if (q.email.trim().toLowerCase() !== user.email?.toLowerCase()) throw new ApiError(403, "FORBIDDEN");
  const { rows } = await query<{ orderId: string; status: string; expiresAt: Date | null }>(
    `SELECT o.order_number AS "orderId", ${ORDER_STATE} AS status, o.ends_at AS "expiresAt"
       FROM orders o
      WHERE o.app_user_id = $1 AND o.app_id = $2
      ORDER BY o.created_at DESC`,
    [user.id, app.id],
  );
  return json({ email: user.email, orders: rows });
});
