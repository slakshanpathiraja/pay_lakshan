import { invalidateAccessCache } from "@/server/access";
import { route } from "@/server/api/route";
import { query, withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import {
  assertNotOwnCard,
  assertValidParent,
  listPermissions,
  permissionConflict,
  setPermissionUrls,
  syncSuperAdminGrants,
  uniqueViolation,
  validateUrls,
} from "@/server/rbac";

export const PUT = route(
  "permissions.update",
  async ({ user, params, body }) => {
    await assertNotOwnCard(user, params.id);
    const urls = validateUrls(body.urls);
    try {
      await withTransaction(async (client) => {
        await assertValidParent(client, body.parentId, params.id);
        const { rowCount } = await client.query(
          // key omitted/empty = keep the current one; parentId omitted = keep, null = top level
          `UPDATE permissions
            SET key = COALESCE($1, key), name = $2,
                parent_id = CASE WHEN $3 THEN $4 ELSE parent_id END, updated_at = now()
          WHERE id = $5`,
          [
            body.key ?? null,
            body.name,
            body.parentId !== undefined,
            body.parentId ?? null,
            params.id,
          ],
        );
        if (!rowCount) throw new ApiError(404, "NOT_FOUND");
        await setPermissionUrls(client, params.id, urls);
        await syncSuperAdminGrants(client); // a newly offered action goes to Super Admin too
      });
    } catch (err) {
      if (uniqueViolation(err)) throw permissionConflict(err);
      throw err;
    }
    invalidateAccessCache();
    const [permission] = await listPermissions("WHERE p.id = $1", [params.id]);
    return json({ permission });
  },
);

/** Removing a card also removes its grants from every role. */
export const DELETE = route("permissions.delete", async ({ user, params }) => {
  await assertNotOwnCard(user, params.id);
  const { rowCount } = await query("DELETE FROM permissions WHERE id = $1", [
    params.id,
  ]);
  if (!rowCount) throw new ApiError(404, "NOT_FOUND");
  invalidateAccessCache();
  return new Response(null, { status: 204 });
});
