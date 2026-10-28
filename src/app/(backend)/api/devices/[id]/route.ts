import { route } from "@/server/api/route";
import { assertDeviceSlot, mapDbError } from "@/server/commerce";
import { query, withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";

/** Moving an active device to another user needs a free slot on that user. */
export const PUT = route(
  "devices.update",
  async ({ req, scope, params, body }) => {
    try {
      const device = await withTransaction(async (client) => {
        const { rows: current } = await client.query<{
          app_user_id: number | null;
          is_active: boolean;
        }>(
          "SELECT app_user_id, is_active FROM devices WHERE id = $1 AND platform_id = $2",
          [params.id, scope.platformId],
        );
        if (!current[0]) throw new ApiError(404, "NOT_FOUND");
        const moved =
          !!body.appUserId && current[0].app_user_id !== body.appUserId;
        if (current[0].is_active && moved)
          await assertDeviceSlot(client, body.appUserId!, params.id);
        const { rows } = await client.query(
          `UPDATE devices SET app_user_id = $1, device_uid = $2, fingerprint = $3, os = $4, model = $5, updated_at = now()
          WHERE id = $6 RETURNING *`,
          [
            body.appUserId,
            body.deviceUid,
            body.fingerprint,
            body.os,
            body.model,
            params.id,
          ],
        );
        return rows[0];
      });
      return json({
        device,
        message: messageFor(req, "notices.deviceUpdated", {
          name: body.deviceUid,
        }),
      });
    } catch (err) {
      mapDbError(err, {
        unique: { devices_app_id_device_uid_key: "DEVICE_TAKEN" },
        foreignKey: "INVALID_USER",
      });
    }
  },
);

export const DELETE = route("devices.delete", async ({ scope, params }) => {
  const { rowCount } = await query(
    "DELETE FROM devices WHERE id = $1 AND platform_id = $2",
    [params.id, scope.platformId],
  );
  if (!rowCount) throw new ApiError(404, "NOT_FOUND");
  return new Response(null, { status: 204 });
});
