import { heldGrants, invalidateAccessCache } from "@/server/access";
import { route } from "@/server/api/route";
import { query, withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import {
  applyRoleChanges,
  assertNotOwnRole,
  findRoleForUpdate,
  listRoles,
  uniqueViolation,
} from "@/server/rbac";

/** Renames and applies only the requested changes; you can only add/remove grants you hold. */
export const PUT = route("roles.update", async ({ user, params, body }) => {
  await assertNotOwnRole(user, params.id);
  const held = await heldGrants(user);
  try {
    await withTransaction(async (client) => {
      const current = await findRoleForUpdate(
        client,
        params.id,
        user.platform_id,
      );
      // The built-in Manager role keeps its name; its grants can change.
      const name = current.key ? current.name : body.name;
      await client.query(
        "UPDATE roles SET name = $1, updated_at = now() WHERE id = $2",
        [name, params.id],
      );
      await applyRoleChanges(
        client,
        params.id,
        { add: body.add, remove: body.remove },
        held,
      );
    });
  } catch (err) {
    if (uniqueViolation(err)) throw new ApiError(409, "ROLE_NAME_TAKEN");
    throw err;
  }
  invalidateAccessCache();
  const [role] = await listRoles("WHERE r.id = $1", [params.id]);
  return json({ role });
});

export const DELETE = route("roles.delete", async ({ user, params }) => {
  await assertNotOwnRole(user, params.id);
  const { rows: role } = await query<{ is_system: boolean }>(
    "SELECT is_system FROM roles WHERE id = $1 AND (platform_id = $2 OR key = 'super_admin')",
    [params.id, user.platform_id],
  );
  if (!role[0]) throw new ApiError(404, "NOT_FOUND");
  if (role[0].is_system) throw new ApiError(400, "SYSTEM_ROLE");
  const { rows } = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM user_platforms WHERE role_id = $1",
    [params.id],
  );
  if (Number(rows[0].count) > 0) throw new ApiError(409, "ROLE_IN_USE");
  const { rowCount } = await query("DELETE FROM roles WHERE id = $1", [
    params.id,
  ]);
  if (!rowCount) throw new ApiError(404, "NOT_FOUND");
  invalidateAccessCache();
  return new Response(null, { status: 204 });
});
