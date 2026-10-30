import { route } from "@/server/api/route";
import { APP_USER_COLUMNS, APP_USER_RETURNING, mapDbError, USER_UNIQUE } from "@/server/commerce";
import { query, withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { stopStripeBilling } from "@/server/stripe";

/** The app can't change — a user belongs to one app. */
export const PUT = route(
  "users.update",
  async ({ req, scope, params, body }) => {
    try {
      const { rows } = await query(
        `UPDATE app_users SET name = $1, email = $2, phone = $3, phone_country = $4, updated_at = now()
        WHERE id = $5 AND platform_id = $6 RETURNING ${APP_USER_RETURNING}`,
        [
          body.name,
          body.email,
          body.phone?.e164 ?? null,
          body.phone?.country ?? null,
          params.id,
          scope.platformId,
        ],
      );
      if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
      return json({
        user: rows[0],
        message: messageFor(req, "notices.userUpdated", { name: body.name }),
      });
    } catch (err) {
      mapDbError(err, { unique: USER_UNIQUE });
    }
  },
);

/** Users with orders are kept (the orders need them); their devices are unlinked. */
/**
 * Deletes the user with everything that is theirs: devices, orders (with their items,
 * payments and queued webhooks) and sign-in tokens. Open payment links and Stripe
 * subscriptions are stopped first, so nobody pays for or keeps being charged for a deleted
 * order.
 */
export const DELETE = route("users.delete", async ({ scope, params }) => {
  const { rows: user } = await query("SELECT id FROM app_users WHERE id = $1 AND platform_id = $2", [
    params.id,
    scope.platformId,
  ]);
  if (!user[0]) throw new ApiError(404, "NOT_FOUND");

  const { rows: billed } = await query<{ platform_id: string; checkout_session_id: string | null; stripe_subscription_id: string | null }>(
    `SELECT platform_id, checkout_session_id, stripe_subscription_id FROM orders
      WHERE app_user_id = $1 AND (checkout_session_id IS NOT NULL OR stripe_subscription_id IS NOT NULL)`,
    [params.id],
  );
  for (const order of billed) await stopStripeBilling(order);

  await withTransaction(async (client) => {
    await client.query("DELETE FROM devices WHERE app_user_id = $1", [params.id]);
    await client.query("DELETE FROM orders WHERE app_user_id = $1", [params.id]);
    await client.query("DELETE FROM app_users WHERE id = $1", [params.id]);
  });
  return new Response(null, { status: 204 });
});
