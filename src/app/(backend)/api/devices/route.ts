import { route } from "@/server/api/route";
import { assertDeviceSlot, mapDbError } from "@/server/commerce";
import { query, withTransaction } from "@/server/db/pool";
import { json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { pageLimit, paged } from "@/server/paging";

export const GET = route("devices.list", async ({ scope, query: q }) => {
  const { rows } = await query(
    `SELECT d.*, a.name AS app_name, u.name AS user_name, u.email AS user_email
       FROM devices d
       JOIN apps a ON a.id = d.app_id
       LEFT JOIN app_users u ON u.id = d.app_user_id
      WHERE d.platform_id = $1
        AND ($2 IS NULL OR d.app_id = $2)
        AND ($3 IS NULL OR d.app_user_id = $3)
      ORDER BY d.created_at DESC
      ${pageLimit(q.page)}`,
    [scope.platformId, scope.appId ?? null, q.appUserId ?? null],
  );
  const { items, page, hasMore } = paged(rows, q.page);
  return json({ devices: items, page, hasMore });
});

/**
 * The user (optional) must be a user of the same app — the composite foreign key checks it —
 * and have a free device slot (`max_devices` active devices).
 */
export const POST = route("devices.create", async ({ req, scope, body }) => {
  try {
    const device = await withTransaction(async (client) => {
      if (body.appUserId) await assertDeviceSlot(client, body.appUserId, null);
      const { rows } = await client.query(
        `INSERT INTO devices (platform_id, app_id, app_user_id, device_uid, fingerprint, os, model)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          scope.platformId,
          body.appId,
          body.appUserId,
          body.deviceUid,
          body.fingerprint,
          body.os,
          body.model,
        ],
      );
      return rows[0];
    });
    return json(
      {
        device,
        message: messageFor(req, "notices.deviceCreated", {
          name: body.deviceUid,
        }),
      },
      201,
    );
  } catch (err) {
    mapDbError(err, {
      unique: { devices_app_id_device_uid_key: "DEVICE_TAKEN" },
      foreignKey: "INVALID_USER",
    });
  }
});
