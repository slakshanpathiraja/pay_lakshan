import { route } from "@/server/api/route";
import { assertDeviceSlot } from "@/server/commerce";
import { withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";

/** Turning a device on needs a free slot on its user (`max_devices`). */
export const PATCH = route(
  "devices.updateStatus",
  async ({ req, scope, params, body }) => {
    const device = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        app_user_id: number | null;
        is_active: boolean;
      }>(
        "SELECT app_user_id, is_active FROM devices WHERE id = $1 AND platform_id = $2 FOR UPDATE",
        [params.id, scope.platformId],
      );
      if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
      if (body.isActive && !rows[0].is_active && rows[0].app_user_id) {
        await assertDeviceSlot(client, rows[0].app_user_id, params.id);
      }
      const { rows: saved } = await client.query<{
        id: number;
        device_uid: string;
        is_active: boolean;
      }>(
        "UPDATE devices SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING id, device_uid, is_active",
        [body.isActive, params.id],
      );
      return saved[0];
    });
    return json({
      item: device,
      message: messageFor(
        req,
        body.isActive ? "notices.deviceActivated" : "notices.deviceDeactivated",
        {
          name: device.device_uid,
        },
      ),
    });
  },
);
