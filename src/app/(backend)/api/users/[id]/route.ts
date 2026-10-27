import { route } from "@/server/api/route";
import { APP_USER_COLUMNS, mapDbError, USER_UNIQUE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";

/** The app can't change — a user belongs to one app. */
export const PUT = route(
  "users.update",
  async ({ req, scope, params, body }) => {
    try {
      const { rows } = await query(
        `UPDATE app_users u SET name = $1, email = $2, phone = $3, phone_country = $4, updated_at = now()
        WHERE id = $5 AND platform_id = $6 RETURNING ${APP_USER_COLUMNS}`,
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
export const DELETE = route("users.delete", async ({ scope, params }) => {
  try {
    const { rowCount } = await query(
      "DELETE FROM app_users WHERE id = $1 AND platform_id = $2",
      [params.id, scope.platformId],
    );
    if (!rowCount) throw new ApiError(404, "NOT_FOUND");
    return new Response(null, { status: 204 });
  } catch (err) {
    mapDbError(err, { foreignKey: "USER_HAS_ORDERS" });
  }
});
