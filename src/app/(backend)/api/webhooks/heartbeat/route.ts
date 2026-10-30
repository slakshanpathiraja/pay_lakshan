import { route } from "@/server/api/route";
import { requireApiUser, verifySignedRequest } from "@/server/app-api";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { hitRateLimit } from "@/server/rate-limit";

/** A heartbeat counts at most this often per device; more are answered but not written. */
const RECORD_EVERY_S = 60;

/**
 * The signed-in user's device is in use: records when it was last seen (and the app version)
 * for the dashboard. Only for the user's own, active device — a device turned off or removed
 * in the dashboard is refused, so the app can sign out.
 */
export const POST = route("appApi.heartbeat", async ({ req, body }) => {
  const app = await verifySignedRequest(body);
  const user = await requireApiUser(req, app);
  if (await hitRateLimit(`heartbeat:${app.id}:${body.deviceUid}`, 30, 15 * 60 * 1000)) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS");
  }

  const { rows } = await query<{ id: number; is_active: boolean; app_user_id: number | null }>(
    "SELECT id, is_active, app_user_id FROM devices WHERE app_id = $1 AND device_uid = $2",
    [app.id, body.deviceUid],
  );
  const device = rows[0];
  if (!device || device.app_user_id !== user.id) throw new ApiError(404, "DEVICE_NOT_REGISTERED");
  if (!device.is_active) throw new ApiError(403, "DEVICE_INACTIVE");

  // once a minute is enough to show "active": skip the write for more frequent beats
  await query(
    `UPDATE devices SET last_seen_at = now(), app_version = COALESCE($2, app_version)
      WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now('-${RECORD_EVERY_S} seconds')
                         OR app_version IS NOT $2)`,
    [device.id, body.appVersion || null],
  );
  return json({ device: { deviceId: body.deviceUid, status: "active" } });
});
