import "server-only";
import { canUseEndpoint } from "./access";
import type { EndpointId } from "./api/endpoints";
import { query } from "./db/pool";
import { ApiError } from "./errors";

// Accounts and platforms:
//   users.role_id            set only for super admins (the global Super Admin role,
//                            platform null): they can work on every platform.
//   user_platforms           everyone else: one row per platform they belong to, each with
//                            that platform's role — so a user's role differs per platform.
// The "active platform" comes from the session; a user's effective role is their role there.

/** A user with their effective role and active platform resolved. */
export interface UserRow {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  password_hash: string;
  /** effective role: Super Admin, or the role on the active platform (null = no platform) */
  role_id: number | null;
  /** "super_admin" | "manager" for built-in roles, null for custom roles */
  role_key: string | null;
  role_name: string | null;
  /** active platform (for a super admin: the one they picked; null if none exist) */
  platform_id: string | null;
  platform_name: string | null;
  must_change_password: boolean;
  is_active: boolean;
  token_version: number;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type PublicUser = Omit<UserRow, "password_hash" | "token_version">;

export function toPublicUser(row: UserRow): PublicUser {
  const { password_hash: _p, token_version: _t, ...rest } = row;
  return rest;
}

/** Super admins hold the global Super Admin role (platform null). */
export function isSuperAdmin(user: Pick<UserRow, "role_key">) {
  return user.role_key === "super_admin";
}

const USER_COLUMNS = `u.id, u.username, u.full_name, u.email, u.password_hash, u.must_change_password,
  u.is_active, u.token_version, u.last_login_at, u.created_at, u.updated_at`;

/**
 * Loads a user with their effective role on `platformId` (falling back to their last used,
 * then first platform when they don't belong to it). Super admins may use any platform.
 */
export async function findById(id: number, platformId?: string | null) {
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLUMNS},
            COALESCE(gr.id, pr.id) AS role_id,
            COALESCE(gr.key, pr.key) AS role_key,
            COALESCE(gr.name, pr.name) AS role_name,
            p.id AS platform_id,
            p.name AS platform_name
       FROM (
         SELECT u.*,
                -- a member: their platform — the requested, else last used, else first one
                -- (members can't use inactive platforms)
                -- (SQLite can't use the outer row in a subquery's ORDER BY: "me" is the user again)
                (SELECT up.platform_id
                   FROM user_platforms up
                   JOIN users me ON me.id = up.user_id
                   JOIN platforms ap ON ap.id = up.platform_id AND ap.is_active
                  WHERE up.user_id = u.id
                  ORDER BY up.platform_id = $2 DESC NULLS LAST,
                           up.platform_id = me.last_platform_id DESC NULLS LAST,
                           up.created_at
                  LIMIT 1) AS member_platform_id,
                -- a super admin may use any platform, picked the same way
                (SELECT pl.id
                   FROM platforms pl
                   LEFT JOIN users me ON me.id = $1
                  ORDER BY pl.id = $2 DESC NULLS LAST,
                           pl.id = me.last_platform_id DESC NULLS LAST,
                           pl.created_at
                  LIMIT 1) AS any_platform_id
           FROM users u
          WHERE u.id = $1
       ) u
       LEFT JOIN roles gr ON gr.id = u.role_id AND gr.key = 'super_admin'
       LEFT JOIN user_platforms m ON gr.id IS NULL AND m.user_id = u.id AND m.platform_id = u.member_platform_id
       LEFT JOIN roles pr ON pr.id = m.role_id
       LEFT JOIN platforms p ON p.id = CASE WHEN gr.id IS NULL THEN u.member_platform_id ELSE u.any_platform_id END
      WHERE u.id = $1`,
    [id, platformId ?? null],
  );
  return rows[0] ?? null;
}

export async function findPublicUser(id: number, platformId?: string | null) {
  const user = await findById(id, platformId);
  return user ? toPublicUser(user) : null;
}

export async function findByUsername(username: string) {
  const { rows } = await query<{
    id: number;
    password_hash: string;
    is_active: boolean;
  }>("SELECT id, password_hash, is_active FROM users WHERE username = $1", [
    username.trim().toLowerCase(),
  ]);
  return rows[0] ?? null;
}

interface PlatformOption {
  id: string;
  name: string;
  is_active: boolean;
  role_key: string | null;
  role_name: string | null;
}

/** The platforms a user can switch to (members: active ones only), with their role on each. */
export async function userPlatforms(user: UserRow) {
  const { rows } = isSuperAdmin(user)
    ? await query<PlatformOption>(
        `SELECT id, name, is_active, 'super_admin' AS role_key, NULL AS role_name
           FROM platforms ORDER BY LOWER(name)`,
      )
    : await query<PlatformOption>(
        `SELECT p.id, p.name, p.is_active, r.key AS role_key, r.name AS role_name
           FROM user_platforms up
           JOIN platforms p ON p.id = up.platform_id AND p.is_active
           JOIN roles r ON r.id = up.role_id
          WHERE up.user_id = $1
          ORDER BY LOWER(p.name)`,
        [user.id],
      );
  return rows;
}

export async function isMember(userId: number, platformId: string) {
  const { rowCount } = await query(
    "SELECT 1 FROM user_platforms WHERE user_id = $1 AND platform_id = $2",
    [userId, platformId],
  );
  return !!rowCount;
}

/**
 * Why an account has no usable platform: PLATFORM_INACTIVE when it belongs to platforms that
 * are all inactive, NO_PLATFORM when it belongs to none.
 */
export async function platformProblem(
  userId: number,
): Promise<"PLATFORM_INACTIVE" | "NO_PLATFORM"> {
  const { rowCount } = await query(
    "SELECT 1 FROM user_platforms WHERE user_id = $1 LIMIT 1",
    [userId],
  );
  return rowCount ? "PLATFORM_INACTIVE" : "NO_PLATFORM";
}

/** Member of the platform and the platform is active — required to work in it. */
export async function canUsePlatform(userId: number, platformId: string) {
  const { rowCount } = await query(
    `SELECT 1 FROM user_platforms up JOIN platforms p ON p.id = up.platform_id AND p.is_active
      WHERE up.user_id = $1 AND up.platform_id = $2`,
    [userId, platformId],
  );
  return !!rowCount;
}

/** The actor's active platform, or NO_PLATFORM when there is none (e.g. no platforms yet). */
export function activePlatform(actor: UserRow): string {
  if (!actor.platform_id) throw new ApiError(400, "NO_PLATFORM");
  return actor.platform_id;
}

/**
 * Resolves which platform an action targets. Defaults to the active platform. Another
 * platform needs: the Platforms card (platforms.list) on the active platform, membership of
 * the target, and `endpoint` granted by the actor's role *on the target* (so a Viewer there
 * can't act there from another platform). Super admins may pick any platform.
 */
export async function resolveTargetPlatform(
  actor: UserRow,
  requested: string | null | undefined,
  endpoint: EndpointId,
) {
  const active = actor.platform_id;
  const target = requested ?? active;
  if (!target) throw new ApiError(400, "NO_PLATFORM");
  if (target === active) return target;
  if (isSuperAdmin(actor)) {
    const { rowCount } = await query("SELECT 1 FROM platforms WHERE id = $1", [
      target,
    ]);
    if (!rowCount) throw new ApiError(400, "INVALID_PLATFORM");
    return target;
  }
  if (
    !(await canUseEndpoint(actor, "platforms.list")) ||
    !(await isMember(actor.id, target))
  ) {
    throw new ApiError(403, "FORBIDDEN");
  }
  const onTarget = await findById(actor.id, target);
  if (
    !onTarget ||
    onTarget.platform_id !== target ||
    !(await canUseEndpoint(onTarget, endpoint))
  ) {
    throw new ApiError(403, "FORBIDDEN");
  }
  return target;
}

/** Guards for managing another account: never your own (no self-escalation or lock-out). */
export function assertNotSelf(actor: UserRow, targetId: number) {
  if (actor.id === targetId) throw new ApiError(400, "CANNOT_MODIFY_SELF");
}

/** The target must belong to the actor's active platform (super admins are never members). */
export async function assertMemberOfActivePlatform(
  actor: UserRow,
  targetId: number,
) {
  if (!(await isMember(targetId, activePlatform(actor))))
    throw new ApiError(404, "NOT_FOUND");
}

/**
 * Password resets and turning an account off reach it on every platform, so a platform's admin
 * may only do them to accounts that belong to their active platform alone (super admins: any).
 */
export async function assertManagesWholeAccount(actor: UserRow, targetId: number) {
  await assertMemberOfActivePlatform(actor, targetId);
  if (isSuperAdmin(actor)) return;
  const { rowCount } = await query(
    "SELECT 1 FROM user_platforms WHERE user_id = $1 AND platform_id <> $2 LIMIT 1",
    [targetId, activePlatform(actor)],
  );
  if (rowCount) throw new ApiError(403, "MANAGER_ON_OTHER_PLATFORMS");
}

/** Throws INVALID_ROLE unless the role exists on that platform (the global Super Admin role never does). */
export async function assertRoleOnPlatform(roleId: number, platformId: string) {
  const { rowCount } = await query(
    "SELECT 1 FROM roles WHERE id = $1 AND platform_id = $2",
    [roleId, platformId],
  );
  if (!rowCount) throw new ApiError(400, "INVALID_ROLE");
}
