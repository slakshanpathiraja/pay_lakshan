import bcrypt from "bcryptjs";
import { route } from "@/server/api/route";
import { query, withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { generateTemporaryPassword } from "@/server/password";
import {
  assertRoleOnPlatform,
  findPublicUser,
  isMember,
  isSuperAdmin,
  resolveTargetPlatform,
  type PublicUser,
} from "@/server/users";

/** Members of the active platform, with their role on it. */
export const GET = route("managers.list", async ({ user }) => {
  if (!user.platform_id) return json({ users: [] });
  const { rows } = await query<PublicUser>(
    `SELECT u.id, u.username, u.full_name, u.email, u.must_change_password, u.is_active,
            u.last_login_at, u.created_at, u.updated_at,
            r.id AS role_id, r.key AS role_key, r.name AS role_name,
            p.id AS platform_id, p.name AS platform_name
       FROM user_platforms up
       JOIN users u ON u.id = up.user_id
       JOIN roles r ON r.id = up.role_id
       JOIN platforms p ON p.id = up.platform_id
      WHERE up.platform_id = $1
      ORDER BY u.created_at`,
    [user.platform_id],
  );
  return json({ users: rows });
});

/**
 * Adds a manager to a platform (the active one unless `platformId` is given — see
 * resolveTargetPlatform). A new username creates the account with a temporary password;
 * an existing one gets this platform added (one account, a role per platform) — by a super
 * admin only.
 */
export const POST = route("managers.create", async ({ user, body }) => {
  const platformId = await resolveTargetPlatform(
    user,
    body.platformId,
    "managers.create",
  );
  await assertRoleOnPlatform(body.roleId, platformId);

  const result = await withTransaction(async (client) => {
    const { rows: existing } = await client.query<{
      id: number;
      role_id: number | null;
    }>("SELECT id, role_id FROM users WHERE username = $1", [
      body.username,
    ]);
    if (existing[0]) {
      // super admins already reach every platform; members can't be added twice. Only a super
      // admin may add an existing account to a platform — otherwise any platform's admin could
      // pull someone else's account in and then reset its password
      if (existing[0].role_id !== null || !isSuperAdmin(user))
        throw new ApiError(409, "USERNAME_TAKEN");
      if (await isMember(existing[0].id, platformId))
        throw new ApiError(409, "ALREADY_MEMBER");
      await client.query(
        "INSERT INTO user_platforms (user_id, platform_id, role_id) VALUES ($1, $2, $3)",
        [existing[0].id, platformId, body.roleId],
      );
      return { id: existing[0].id, temporaryPassword: null };
    }

    // The temporary password is returned once so the admin can share the invite;
    // only its hash is stored, and the manager must replace it on first sign in.
    const temporaryPassword = generateTemporaryPassword();
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO users (username, password_hash, must_change_password, last_platform_id)
       VALUES ($1, $2, TRUE, $3) RETURNING id`,
      [body.username, await bcrypt.hash(temporaryPassword, 12), platformId],
    );
    await client.query(
      "INSERT INTO user_platforms (user_id, platform_id, role_id) VALUES ($1, $2, $3)",
      [rows[0].id, platformId, body.roleId],
    );
    return { id: rows[0].id, temporaryPassword };
  });

  return json(
    {
      user: await findPublicUser(result.id, platformId),
      temporaryPassword: result.temporaryPassword,
      /** true when an existing account was added to this platform */
      addedExisting: result.temporaryPassword === null,
    },
    201,
  );
});
