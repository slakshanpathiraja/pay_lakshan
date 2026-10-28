import { invalidateAccessCache } from "@/server/access";
import { route } from "@/server/api/route";
import { query, withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { PLATFORM_SELECT, type PlatformRow } from "@/server/platforms";
import { isSuperAdmin, resolveTargetPlatform } from "@/server/users";

/**
 * Rename. Non super admins only for platforms where their role there allows it (checked
 * against the target platform, not just the active one).
 */
export const PUT = route("platforms.update", async ({ user, params, body }) => {
  await resolveTargetPlatform(user, params.id, "platforms.update");
  try {
    const { rowCount } = await query(
      "UPDATE platforms SET name = $1, updated_at = now() WHERE id = $2",
      [body.name, params.id],
    );
    if (!rowCount) throw new ApiError(404, "NOT_FOUND");
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ApiError(409, "PLATFORM_NAME_TAKEN");
    throw err;
  }
  const { rows } = await query<PlatformRow>(
    `SELECT ${PLATFORM_SELECT} WHERE p.id = $1`,
    [params.id],
  );
  return json({ platform: rows[0] });
});

/**
 * Deletes the platform with its roles and memberships. Accounts that belonged only to this
 * platform are deleted too (an account without a platform can't sign in).
 * Non super admins: only platforms where their role there allows it, and not their active one.
 */
export const DELETE = route("platforms.delete", async ({ user, params }) => {
  // non super admins: only platforms they belong to, and never the one they're working in
  if (!isSuperAdmin(user)) {
    if (params.id === user.platform_id)
      throw new ApiError(400, "ACTIVE_PLATFORM");
    await resolveTargetPlatform(user, params.id, "platforms.delete");
  }
  await withTransaction(async (client) => {
    const { rows: members } = await client.query<{ user_id: number }>(
      "SELECT user_id FROM user_platforms WHERE platform_id = $1",
      [params.id],
    );
    const { rowCount } = await client.query(
      "DELETE FROM platforms WHERE id = $1",
      [params.id],
    );
    if (!rowCount) throw new ApiError(404, "NOT_FOUND");
    await client.query(
      `DELETE FROM users
        WHERE users.id IN (SELECT value FROM json_each($1)) AND users.role_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_platforms up WHERE up.user_id = users.id)`,
      [members.map((m) => m.user_id)],
    );
  });
  invalidateAccessCache();
  return new Response(null, { status: 204 });
});
