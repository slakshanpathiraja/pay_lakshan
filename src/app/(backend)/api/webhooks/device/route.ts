import { route } from "@/server/api/route";
import { requireApiUser, verifySignedRequest } from "@/server/app-api";
import { assertDeviceSlot, mapDbError } from "@/server/commerce";
import { withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";

/**
 * Registers the signed-in user's device. The same `deviceUid` again returns it (its details
 * updated); a device of another user is refused. New ones count against allowed devices.
 */
export const POST = route("appApi.device", async ({ req, body }) => {
  const app = await verifySignedRequest(body);
  const user = await requireApiUser(req, app);
  const details = [body.fingerprint || null, body.os, body.model || null];
  try {
    const { device, created } = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number; app_user_id: number | null; is_active: boolean }>(
        "SELECT id, app_user_id, is_active FROM devices WHERE app_id = $1 AND device_uid = $2",
        [app.id, body.deviceUid],
      );
      const existing = rows[0];
      if (existing && existing.app_user_id !== null && existing.app_user_id !== user.id) {
        throw new ApiError(409, "DEVICE_TAKEN");
      }
      if (existing) {
        // a device added in the dashboard without a user becomes this user's
        if (existing.app_user_id === null && existing.is_active) await assertDeviceSlot(client, user.id, null);
        const { rows: updated } = await client.query<{ device_uid: string; is_active: boolean }>(
          `UPDATE devices SET app_user_id = $2, fingerprint = $3, os = $4, model = $5, updated_at = now()
            WHERE id = $1 RETURNING device_uid, is_active`,
          [existing.id, user.id, ...details],
        );
        return { device: updated[0], created: false };
      }
      await assertDeviceSlot(client, user.id, null);
      const { rows: inserted } = await client.query<{ device_uid: string; is_active: boolean }>(
        `INSERT INTO devices (platform_id, app_id, app_user_id, device_uid, fingerprint, os, model)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING device_uid, is_active`,
        [app.platform_id, app.id, user.id, body.deviceUid, ...details],
      );
      return { device: inserted[0], created: true };
    });
    return json(
      {
        device: { deviceId: device.device_uid, status: device.is_active ? "active" : "inactive" },
        created,
      },
      created ? 201 : 200,
    );
  } catch (err) {
    mapDbError(err, { unique: { devices_app_id_device_uid_key: "DEVICE_TAKEN" } });
  }
});
