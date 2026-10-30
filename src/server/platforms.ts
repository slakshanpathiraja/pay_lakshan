import "server-only";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { keyFromName, type Action } from "@/lib/access";
import { ApiError } from "./errors";
import { generateTemporaryPassword } from "./password";
import { setRoleGrants } from "./rbac";
import seed from "./seed/permissions.json";
import type { DbClient } from "./db/pool";

export interface PlatformRow {
  id: string;
  name: string;
  is_active: boolean;
  is_test: boolean;
  member_count: number;
  role_count: number;
  created_at: Date;
  updated_at: Date;
}

export const PLATFORM_SELECT = `p.*,
  (SELECT COUNT(*) FROM user_platforms up WHERE up.platform_id = p.id) AS member_count,
  (SELECT COUNT(*) FROM roles r WHERE r.platform_id = p.id) AS role_count
  FROM platforms p`;

/**
 * Creates a platform (a random UUID) and its built-in Manager role, which
 * gets the default grants from seed/permissions.json (`newPlatform.managerGrants`, by card key).
 */
export async function createPlatform(client: DbClient, name: string, isTest = false) {
  let platformId: string;
  try {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO platforms (id, name, is_test) VALUES ($1, $2, $3) RETURNING id",
      [randomUUID(), name, isTest],
    );
    platformId = rows[0].id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ApiError(409, "PLATFORM_NAME_TAKEN");
    throw err;
  }

  const { rows: role } = await client.query<{ id: number }>(
    `INSERT INTO roles (platform_id, key, name, is_system) VALUES ($1, 'manager', 'Manager', TRUE) RETURNING id`,
    [platformId],
  );
  const grants = Object.entries(
    seed.newPlatform.managerGrants as Record<string, Action[]>,
  );
  const { rows: cards } = await client.query<{ id: number; key: string }>(
    "SELECT id, key FROM permissions WHERE key IN (SELECT value FROM json_each($1))",
    [grants.map(([key]) => key)],
  );
  await setRoleGrants(
    client,
    role[0].id,
    grants.flatMap(([key, actions]) => {
      const card = cards.find((c) => c.key === key);
      return card ? [{ permissionId: card.id, actions }] : [];
    }),
  );
  return { platformId, managerRoleId: role[0].id };
}

/**
 * Creates the platform's first account: `manager.<platform-name>` (a number is added if the
 * name is taken — usernames are unique across platforms) with a random temporary password,
 * given the platform's Manager role. The password is returned once, for the invite.
 */
export async function createPlatformManager(
  client: DbClient,
  platform: { id: string; name: string; managerRoleId: number },
) {
  const base = `manager.${keyFromName(platform.name)
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 40)}`;
  const { rows: taken } = await client.query<{ username: string }>(
    "SELECT username FROM users WHERE username = $1 OR username LIKE $1 || '-%'",
    [base],
  );
  const used = new Set(taken.map((r) => r.username));
  let username = base;
  for (let n = 2; used.has(username); n++) username = `${base}-${n}`;

  const temporaryPassword = generateTemporaryPassword();
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO users (username, password_hash, must_change_password, last_platform_id)
     VALUES ($1, $2, TRUE, $3) RETURNING id`,
    [username, await bcrypt.hash(temporaryPassword, 12), platform.id],
  );
  await client.query(
    "INSERT INTO user_platforms (user_id, platform_id, role_id) VALUES ($1, $2, $3)",
    [rows[0].id, platform.id, platform.managerRoleId],
  );
  return { username, temporaryPassword };
}
