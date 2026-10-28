import "server-only";
import type pg from "pg";
import {
  ACTIONS,
  actionsUpTo,
  sortActions,
  topAction,
  type Action,
} from "@/lib/access";
import { grantablePages } from "@/utils/menu";
import {
  endpointKey,
  grantableEndpointIds,
  normalizePath,
  type HttpMethod,
} from "./api/endpoints";
import { query } from "./db/pool";
import { ApiError } from "./errors";
import { isSuperAdmin, type UserRow } from "./users";

// Access model (3D): role × permission card × action.
//   permission_urls          URLs on a card (frontend pages, backend "METHOD /path")
//   permission_url_actions   what each URL is used for (view / create / edit / delete)
//   role_permission_actions  which actions of which card a role holds
// A role may use a URL when it holds, on that URL's card, one of the URL's actions.

export interface PermissionUrl {
  kind: "page" | "api";
  method: HttpMethod | null;
  path: string;
  actions: Action[];
}

export interface PermissionRow {
  id: number;
  /** unique key, given or generated from the name */
  key: string;
  name: string;
  /** optional parent card (grouping only) */
  parent_id: number | null;
  urls: PermissionUrl[];
  /** every action used by at least one of the card's URLs */
  actions: Action[];
  role_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface RoleGrant {
  permission_id: number;
  actions: Action[];
}

export interface RoleRow {
  id: number;
  /** the platform this role belongs to (null only for the global Super Admin role) */
  platform_id: string | null;
  /** 'super_admin' | 'manager' for the built-in roles, otherwise null */
  key: string | null;
  is_system: boolean;
  is_active: boolean;
  name: string;
  grants: RoleGrant[];
  user_count: number;
  created_at: Date;
  updated_at: Date;
}

export async function listRoles(where = "", params: unknown[] = []) {
  const { rows } = await query<RoleRow>(
    `SELECT r.*,
            COALESCE((SELECT json_agg(json_build_object('permission_id', g.permission_id, 'actions', g.actions)
                                      ORDER BY g.permission_id)
                        FROM (SELECT permission_id, array_agg(action) AS actions
                                FROM role_permission_actions
                               WHERE role_id = r.id
                               GROUP BY permission_id) g), '[]') AS grants,
            ((SELECT COUNT(*) FROM user_platforms up WHERE up.role_id = r.id)
              + (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id))::int AS user_count
       FROM roles r
       ${where}
      ORDER BY r.is_system DESC, r.key = 'manager', LOWER(r.name)`,
    params,
  );
  for (const role of rows) {
    role.grants = role.grants.map((g) => ({
      ...g,
      actions: sortActions(g.actions),
    }));
  }
  return rows;
}

export async function listPermissions(where = "", params: unknown[] = []) {
  const { rows } = await query<PermissionRow>(
    `SELECT p.*,
            COALESCE((SELECT json_agg(json_build_object(
                                'kind', u.kind, 'method', u.method, 'path', u.path,
                                'actions', (SELECT COALESCE(json_agg(a.action), '[]')
                                              FROM permission_url_actions a WHERE a.permission_url_id = u.id))
                              ORDER BY u.kind DESC, u.path, u.method)
                        FROM permission_urls u WHERE u.permission_id = p.id), '[]') AS urls,
            (SELECT COUNT(DISTINCT rpa.role_id)
               FROM role_permission_actions rpa WHERE rpa.permission_id = p.id)::int AS role_count
       FROM permissions p
       ${where}
      ORDER BY p.id`,
    params,
  );
  for (const card of rows) {
    card.urls = card.urls.map((u) => ({
      ...u,
      actions: sortActions(u.actions),
    }));
    card.actions = sortActions(card.urls.flatMap((u) => u.actions));
  }
  return rows;
}

const grantablePagePaths = new Set(grantablePages.map((p) => p.href));
const grantableEndpointKeys = new Set(grantableEndpointIds.map(endpointKey));

interface UrlInput {
  kind: "page" | "api";
  method?: HttpMethod | null;
  path: string;
  actions: Action[];
}

/**
 * Normalises typed URLs (leading slash, `:id` → `{id}`), merges duplicates, and checks
 * each one is a real, grantable page or endpoint. Unknown URLs → INVALID_GRANT with the
 * offending values in `details`.
 */
export function validateUrls(urls: UrlInput[]): PermissionUrl[] {
  const merged = new Map<string, PermissionUrl>();
  const invalid: string[] = [];
  for (const u of urls) {
    const path = normalizePath(u.path);
    const method = u.kind === "api" ? (u.method ?? null) : null;
    const label = method ? `${method} ${path}` : path;
    const known =
      u.kind === "page"
        ? grantablePagePaths.has(path)
        : grantableEndpointKeys.has(label);
    if (!known) {
      invalid.push(label);
      continue;
    }
    const key = `${u.kind} ${label}`;
    const existing = merged.get(key);
    merged.set(key, {
      kind: u.kind,
      method,
      path,
      actions: sortActions([...(existing?.actions ?? []), ...u.actions]),
    });
  }
  if (invalid.length) throw new ApiError(400, "INVALID_GRANT", invalid);
  return [...merged.values()];
}

/**
 * Replaces a card's URLs and their actions. Role grants for actions the card no longer
 * offers are removed so the matrix never holds dead entries.
 */
export async function setPermissionUrls(
  client: pg.PoolClient,
  permissionId: number,
  urls: PermissionUrl[],
) {
  await client.query("DELETE FROM permission_urls WHERE permission_id = $1", [
    permissionId,
  ]);
  for (const u of urls) {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO permission_urls (permission_id, kind, method, path) VALUES ($1, $2, $3, $4) RETURNING id`,
      [permissionId, u.kind, u.method, u.path],
    );
    await client.query(
      `INSERT INTO permission_url_actions (permission_url_id, action) SELECT $1, unnest($2::varchar[])`,
      [rows[0].id, u.actions],
    );
  }
  await client.query(
    `DELETE FROM role_permission_actions rpa
      WHERE rpa.permission_id = $1
        AND NOT EXISTS (SELECT 1 FROM permission_urls u
                          JOIN permission_url_actions a ON a.permission_url_id = u.id
                         WHERE u.permission_id = $1 AND a.action = rpa.action)`,
    [permissionId],
  );
}

/**
 * Replaces a role's grants. Each card must exist and each action must be one the card
 * offers (used by at least one of its URLs); otherwise INVALID_GRANT. Actions are levels,
 * so a grant is expanded to every offered action up to its highest level
 * (e.g. "edit" → view + create + edit).
 */
export async function setRoleGrants(
  client: pg.PoolClient,
  roleId: number,
  grants: { permissionId: number; actions: Action[] }[],
) {
  const ids = [...new Set(grants.map((g) => g.permissionId))];
  const { rows } = await client.query<{
    permission_id: number;
    action: Action;
  }>(
    `SELECT DISTINCT u.permission_id, a.action
       FROM permission_urls u JOIN permission_url_actions a ON a.permission_url_id = u.id
      WHERE u.permission_id = ANY($1::int[])`,
    [ids],
  );
  const offered = new Set(rows.map((r) => `${r.permission_id}:${r.action}`));
  const invalid = grants.flatMap((g) =>
    g.actions
      .filter((a) => !offered.has(`${g.permissionId}:${a}`))
      .map((a) => `${g.permissionId}:${a}`),
  );
  if (invalid.length) throw new ApiError(400, "INVALID_GRANT", invalid);

  const offeredBy = (id: number) =>
    rows.filter((r) => r.permission_id === id).map((r) => r.action);
  const pairs = grants.flatMap((g) =>
    actionsUpTo(topAction(g.actions), offeredBy(g.permissionId)).map(
      (a) => [g.permissionId, a] as const,
    ),
  );

  await client.query("DELETE FROM role_permission_actions WHERE role_id = $1", [
    roleId,
  ]);
  if (pairs.length) {
    await client.query(
      `INSERT INTO role_permission_actions (role_id, permission_id, action)
       SELECT $1, permission_id, action FROM unnest($2::int[], $3::varchar[]) AS t(permission_id, action)
       ON CONFLICT DO NOTHING`,
      [roleId, pairs.map((p) => p[0]), pairs.map((p) => p[1])],
    );
  }
}

/** Super Admin holds every action of every card (called after cards change). */
export async function syncSuperAdminGrants(
  client: Pick<pg.PoolClient, "query">,
) {
  await client.query(
    `INSERT INTO role_permission_actions (role_id, permission_id, action)
     SELECT DISTINCT r.id, u.permission_id, a.action
       FROM roles r
      CROSS JOIN permission_urls u
       JOIN permission_url_actions a ON a.permission_url_id = u.id
      WHERE r.key = 'super_admin'
     ON CONFLICT DO NOTHING`,
  );
}

/**
 * Loads a role of `platformId` for editing (roles of other platforms are "not found");
 * the built-in roles have fixed names, Super Admin is fully locked.
 */
export async function findRoleForUpdate(
  client: pg.PoolClient,
  id: number,
  platformId: string | null,
) {
  const { rows } = await client.query<{ key: string | null; name: string }>(
    "SELECT key, name FROM roles WHERE id = $1 AND (platform_id = $2 OR key = 'super_admin') FOR UPDATE",
    [id, platformId],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
  if (rows[0].key === "super_admin") throw new ApiError(400, "SYSTEM_ROLE");
  return rows[0];
}

/**
 * Stops anyone but a super admin from widening their own access: they may not edit
 * the role they have, or a permission card their role holds actions on.
 */
export async function assertNotOwnRole(actor: UserRow, roleId: number) {
  if (!isSuperAdmin(actor) && actor.role_id === roleId)
    throw new ApiError(400, "CANNOT_MODIFY_OWN_ROLE");
}

/**
 * Permission cards are shared by every platform's roles: only a super admin may create,
 * change or delete them (a platform admin could otherwise widen other platforms' roles).
 */
export function assertCanEditCards(actor: UserRow) {
  if (!isSuperAdmin(actor)) throw new ApiError(403, "FORBIDDEN");
}

export async function assertNotOwnCard(actor: UserRow, permissionId: number) {
  if (isSuperAdmin(actor)) return;
  const { rowCount } = await query(
    "SELECT 1 FROM role_permission_actions WHERE role_id = $1 AND permission_id = $2 LIMIT 1",
    [actor.role_id, permissionId],
  );
  if (rowCount) throw new ApiError(400, "CANNOT_MODIFY_OWN_ROLE");
}

export function uniqueViolation(err: unknown) {
  return (err as { code?: string }).code === "23505";
}

/**
 * A free key based on `base`: `base`, then `base-2`, `base-3`, … (skipping `excludeId`,
 * the card being edited).
 */
export async function uniquePermissionKey(
  client: Pick<pg.PoolClient, "query">,
  base: string,
  excludeId?: number,
) {
  const { rows } = await client.query<{ key: string }>(
    "SELECT key FROM permissions WHERE (key = $1 OR key LIKE $1 || '-%') AND id IS DISTINCT FROM $2",
    [base, excludeId ?? null],
  );
  const taken = new Set(rows.map((r) => r.key));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Maps a unique violation on permissions to the right error code. */
export function permissionConflict(err: unknown) {
  const constraint = (err as { constraint?: string }).constraint;
  return new ApiError(
    409,
    constraint === "permissions_key_idx"
      ? "PERMISSION_KEY_TAKEN"
      : "PERMISSION_NAME_TAKEN",
  );
}

/**
 * Throws INVALID_PARENT unless `parentId` is null or an existing card that isn't the card
 * itself or one of its descendants (which would create a loop).
 */
export async function assertValidParent(
  client: Pick<pg.PoolClient, "query">,
  parentId: number | null | undefined,
  cardId?: number,
) {
  if (parentId == null) return;
  if (parentId === cardId) throw new ApiError(400, "INVALID_PARENT");
  const { rows } = await client.query<{ id: number }>(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_id FROM permissions WHERE id = $1
       UNION
       SELECT p.id, p.parent_id FROM permissions p JOIN chain c ON p.id = c.parent_id
     )
     SELECT id FROM chain`,
    [parentId],
  );
  // `rows` = the parent and all its ancestors; the card must not be among them.
  if (
    !rows.length ||
    (cardId !== undefined && rows.some((r) => r.id === cardId))
  ) {
    throw new ApiError(400, "INVALID_PARENT");
  }
}

export interface GrantChange {
  permissionId: number;
  actions: Action[];
}

/**
 * Applies changes to a role's grants and returns nothing; the rules:
 *  - actions are levels: adding a level adds the card's lower levels, removing a level
 *    removes the higher ones too (so the role always holds a clean range per card);
 *  - each action must be one the card offers (INVALID_GRANT);
 *  - every card × action that actually changes must be held by the editor — you can't give
 *    what you don't have, nor take it away from someone who has it (GRANT_NOT_HELD).
 *    `held` null = super admin (holds everything).
 */
export async function applyRoleChanges(
  client: pg.PoolClient,
  roleId: number,
  changes: { add: GrantChange[]; remove: GrantChange[] },
  held: Set<string> | null,
) {
  const cardIds = [
    ...new Set([...changes.add, ...changes.remove].map((c) => c.permissionId)),
  ];
  if (!cardIds.length) return;

  const { rows: offeredRows } = await client.query<{
    permission_id: number;
    action: Action;
    name: string;
  }>(
    `SELECT DISTINCT u.permission_id, a.action, p.name
       FROM permission_urls u
       JOIN permission_url_actions a ON a.permission_url_id = u.id
       JOIN permissions p ON p.id = u.permission_id
      WHERE u.permission_id = ANY($1::int[])`,
    [cardIds],
  );
  const offered = (id: number) =>
    offeredRows.filter((r) => r.permission_id === id).map((r) => r.action);
  const cardName = new Map(offeredRows.map((r) => [r.permission_id, r.name]));

  const invalid = [...changes.add, ...changes.remove].flatMap((c) =>
    c.actions
      .filter((a) => !offered(c.permissionId).includes(a))
      .map((a) => `${c.permissionId}:${a}`),
  );
  if (invalid.length) throw new ApiError(400, "INVALID_GRANT", invalid);

  const { rows: currentRows } = await client.query<{
    permission_id: number;
    action: Action;
  }>(
    "SELECT permission_id, action FROM role_permission_actions WHERE role_id = $1 AND permission_id = ANY($2::int[])",
    [roleId, cardIds],
  );
  const current = new Set(
    currentRows.map((r) => `${r.permission_id}:${r.action}`),
  );
  const next = new Set(current);
  for (const c of changes.add) {
    for (const a of actionsUpTo(topAction(c.actions), offered(c.permissionId)))
      next.add(`${c.permissionId}:${a}`);
  }
  for (const c of changes.remove) {
    const lowest = sortActions(c.actions)[0];
    for (const a of offered(c.permissionId)) {
      if (ACTIONS.indexOf(a) >= ACTIONS.indexOf(lowest))
        next.delete(`${c.permissionId}:${a}`);
    }
  }

  const added = [...next].filter((g) => !current.has(g));
  const removed = [...current].filter((g) => !next.has(g));
  if (held) {
    const notHeld = [...added, ...removed].filter((g) => !held.has(g));
    if (notHeld.length) {
      const describe = (g: string) => {
        const [id, action] = g.split(":");
        return `${cardName.get(Number(id)) ?? id}: ${action}`;
      };
      throw new ApiError(403, "GRANT_NOT_HELD", notHeld.map(describe));
    }
  }

  const pairs = (list: string[]) =>
    list.map((g) => g.split(":")).map(([id, a]) => [Number(id), a] as const);
  if (removed.length) {
    await client.query(
      `DELETE FROM role_permission_actions g
        USING unnest($2::int[], $3::varchar[]) AS t(permission_id, action)
        WHERE g.role_id = $1 AND g.permission_id = t.permission_id AND g.action = t.action`,
      [
        roleId,
        pairs(removed).map((p) => p[0]),
        pairs(removed).map((p) => p[1]),
      ],
    );
  }
  if (added.length) {
    await client.query(
      `INSERT INTO role_permission_actions (role_id, permission_id, action)
       SELECT $1, permission_id, action FROM unnest($2::int[], $3::varchar[]) AS t(permission_id, action)
       ON CONFLICT DO NOTHING`,
      [roleId, pairs(added).map((p) => p[0]), pairs(added).map((p) => p[1])],
    );
  }
}
