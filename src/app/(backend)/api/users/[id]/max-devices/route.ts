import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";

/** Lowering it below the active devices keeps them; new ones are refused until under the limit. */
export const PATCH = route(
  "users.updateMaxDevices",
  async ({ req, scope, params, body }) => {
    const { rows } = await query<{
      id: number;
      name: string;
      max_devices: number;
    }>(
      `UPDATE app_users SET max_devices = $1, updated_at = now() WHERE id = $2 AND platform_id = $3
     RETURNING id, name, max_devices`,
      [body.maxDevices, params.id, scope.platformId],
    );
    if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
    return json({
      item: rows[0],
      message: messageFor(req, "notices.userMaxDevicesChanged", {
        name: rows[0].name,
        count: body.maxDevices,
      }),
    });
  },
);
