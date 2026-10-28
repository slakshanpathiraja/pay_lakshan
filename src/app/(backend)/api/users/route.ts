import { route } from "@/server/api/route";
import { APP_USER_COLUMNS, APP_USER_RETURNING, mapDbError, USER_UNIQUE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { formatPhone } from "@/lib/phone";
import { messageFor } from "@/server/messages";
import { pageLimit, paged } from "@/server/paging";

// An app's customers ("users" of the app; portal accounts are managers).

export const GET = route("users.list", async ({ scope, query: q }) => {
  const { rows } = await query(
    `SELECT ${APP_USER_COLUMNS}, a.name AS app_name,
            (SELECT count(*) FROM devices d WHERE d.app_user_id = u.id AND d.is_active) AS device_count,
            (SELECT count(*) FROM orders o WHERE o.app_user_id = u.id) AS order_count,
            (SELECT count(*) FROM orders o WHERE o.app_user_id = u.id AND o.order_status = 'pending')
              AS pending_order_count
       FROM app_users u
       JOIN apps a ON a.id = u.app_id
      WHERE u.platform_id = $1
        AND ($2 IS NULL OR u.app_id = $2)
        AND ($3 IS NULL OR u.name LIKE $3 OR u.email LIKE $3 OR u.phone LIKE $4)
      ORDER BY u.created_at DESC
      ${pageLimit(q.page)}`,
    [
      scope.platformId,
      scope.appId ?? null,
      q.search ? `%${q.search}%` : null,
      // phones are stored as digits: "077 123" finds +9477123…
      q.search
        ? `%${q.search.replace(/\D/g, "").replace(/^0/, "") || "-"}%`
        : null,
    ],
  );
  const { items, page, hasMore } = paged(rows, q.page);
  return json({ users: items, page, hasMore });
});

/** Without a name (a quick add with just an email), the email — or else the phone — is used. */
export const POST = route("users.create", async ({ req, scope, body }) => {
  const name = body.name ?? body.email ?? formatPhone(body.phone!.e164);
  try {
    const { rows } = await query(
      `INSERT INTO app_users (platform_id, app_id, name, email, phone, phone_country, max_devices, max_pending_orders)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${APP_USER_RETURNING}`,
      [
        scope.platformId,
        body.appId,
        name,
        body.email,
        body.phone?.e164 ?? null,
        body.phone?.country ?? null,
        body.maxDevices,
        body.maxPendingOrders,
      ],
    );
    return json(
      {
        user: rows[0],
        message: messageFor(req, "notices.userCreated", { name }),
      },
      201,
    );
  } catch (err) {
    mapDbError(err, { unique: USER_UNIQUE });
  }
});
