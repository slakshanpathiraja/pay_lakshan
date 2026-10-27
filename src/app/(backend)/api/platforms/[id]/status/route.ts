import { invalidateAccessCache } from "@/server/access";
import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { PLATFORM_SELECT, type PlatformRow } from "@/server/platforms";
import { isMember, isSuperAdmin } from "@/server/users";

/**
 * Activates / deactivates a platform. Members can't use an inactive platform.
 * Non super admins: only platforms they belong to, and never the one they're working in.
 */
export const PATCH = route(
  "platforms.updateStatus",
  async ({ req, user, params, body }) => {
    if (!isSuperAdmin(user)) {
      if (!(await isMember(user.id, params.id)))
        throw new ApiError(404, "NOT_FOUND");
      if (params.id === user.platform_id)
        throw new ApiError(400, "ACTIVE_PLATFORM");
    }
    const { rowCount } = await query(
      "UPDATE platforms SET is_active = $1, updated_at = now() WHERE id = $2",
      [body.isActive, params.id],
    );
    if (!rowCount) throw new ApiError(404, "NOT_FOUND");
    invalidateAccessCache();
    const { rows } = await query<PlatformRow>(
      `SELECT ${PLATFORM_SELECT} WHERE p.id = $1`,
      [params.id],
    );
    return json({
      platform: rows[0],
      message: messageFor(
        req,
        body.isActive
          ? "notices.platformActivated"
          : "notices.platformDeactivated",
        {
          name: rows[0].name,
        },
      ),
    });
  },
);
