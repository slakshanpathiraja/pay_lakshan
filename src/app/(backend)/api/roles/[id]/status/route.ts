import { invalidateAccessCache } from "@/server/access";
import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { assertNotOwnRole, listRoles } from "@/server/rbac";

/**
 * Activates / deactivates a role of the active platform. An inactive role grants nothing.
 * The Super Admin role can't be deactivated; non super admins can't change their own role.
 */
export const PATCH = route(
  "roles.updateStatus",
  async ({ req, user, params, body }) => {
    await assertNotOwnRole(user, params.id);
    const { rows } = await query<{ key: string | null }>(
      "SELECT key FROM roles WHERE id = $1 AND platform_id = $2",
      [params.id, user.platform_id],
    );
    if (!rows[0]) {
      const isSuperRole = (
        await query(
          "SELECT 1 FROM roles WHERE id = $1 AND key = 'super_admin'",
          [params.id],
        )
      ).rowCount;
      throw new ApiError(
        isSuperRole ? 400 : 404,
        isSuperRole ? "SYSTEM_ROLE" : "NOT_FOUND",
      );
    }
    await query(
      "UPDATE roles SET is_active = $1, updated_at = now() WHERE id = $2",
      [body.isActive, params.id],
    );
    invalidateAccessCache();
    const [role] = await listRoles("WHERE r.id = $1", [params.id]);
    return json({
      role,
      message: messageFor(
        req,
        body.isActive ? "notices.roleActivated" : "notices.roleDeactivated",
        {
          name: role.name,
        },
      ),
    });
  },
);
