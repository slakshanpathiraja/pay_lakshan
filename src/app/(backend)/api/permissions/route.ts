import { invalidateAccessCache } from "@/server/access";
import { route } from "@/server/api/route";
import { withTransaction } from "@/server/db/pool";
import { json } from "@/server/http";
import { keyFromName } from "@/lib/access";
import {
  assertCanEditCards,
  assertValidParent,
  listPermissions,
  permissionConflict,
  setPermissionUrls,
  syncSuperAdminGrants,
  uniquePermissionKey,
  uniqueViolation,
  validateUrls,
} from "@/server/rbac";

export const GET = route("permissions.list", async () =>
  json({ permissions: await listPermissions() }),
);

export const POST = route("permissions.create", async ({ user, body }) => {
  assertCanEditCards(user);
  const urls = validateUrls(body.urls);
  try {
    const id = await withTransaction(async (client) => {
      await assertValidParent(client, body.parentId);
      const key =
        body.key ?? (await uniquePermissionKey(client, keyFromName(body.name)));
      const { rows } = await client.query<{ id: number }>(
        "INSERT INTO permissions (key, name, parent_id) VALUES ($1, $2, $3) RETURNING id",
        [key, body.name, body.parentId ?? null],
      );
      await setPermissionUrls(client, rows[0].id, urls);
      // Super Admin gets every action of every new card automatically.
      await syncSuperAdminGrants(client);
      return rows[0].id;
    });
    invalidateAccessCache();
    const [permission] = await listPermissions("WHERE p.id = $1", [id]);
    return json({ permission }, 201);
  } catch (err) {
    if (uniqueViolation(err)) throw permissionConflict(err);
    throw err;
  }
});
