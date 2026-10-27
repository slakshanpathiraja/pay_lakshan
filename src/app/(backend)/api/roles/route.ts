import { heldGrants, invalidateAccessCache } from "@/server/access";
import { route } from "@/server/api/route";
import { withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { applyRoleChanges, listRoles, uniqueViolation } from "@/server/rbac";
import { activePlatform, isSuperAdmin } from "@/server/users";

/** Roles of the active platform (plus the global Super Admin role, shown to super admins). */
export const GET = route("roles.list", async ({ user }) =>
  json({
    roles: await listRoles(
      "WHERE r.platform_id = $1 OR (r.key = 'super_admin' AND r.platform_id IS NULL AND $2)",
      [user.platform_id, isSuperAdmin(user)],
    ),
  }),
);

/** Creates a role on the active platform; names are unique per platform, grants within your own. */
export const POST = route("roles.create", async ({ user, body }) => {
  const platformId = activePlatform(user);
  const held = await heldGrants(user);
  try {
    const id = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        "INSERT INTO roles (platform_id, name) VALUES ($1, $2) RETURNING id",
        [platformId, body.name],
      );
      // you can only give what you hold
      await applyRoleChanges(
        client,
        rows[0].id,
        { add: body.grants, remove: [] },
        held,
      );
      return rows[0].id;
    });
    invalidateAccessCache();
    const [role] = await listRoles("WHERE r.id = $1", [id]);
    return json({ role }, 201);
  } catch (err) {
    if (uniqueViolation(err)) throw new ApiError(409, "ROLE_NAME_TAKEN");
    throw err;
  }
});
