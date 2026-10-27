import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";

export const PATCH = route(
  "users.updateStatus",
  async ({ req, scope, params, body }) => {
    const { rows } = await query<{
      id: number;
      name: string;
      is_active: boolean;
    }>(
      `UPDATE app_users SET is_active = $1, updated_at = now() WHERE id = $2 AND platform_id = $3
     RETURNING id, name, is_active`,
      [body.isActive, params.id, scope.platformId],
    );
    if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
    return json({
      item: rows[0],
      message: messageFor(
        req,
        body.isActive ? "notices.userActivated" : "notices.userDeactivated",
        {
          name: rows[0].name,
        },
      ),
    });
  },
);
