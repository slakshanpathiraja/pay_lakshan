import "server-only";
import type { AccessInfo, Action } from "@/lib/access";
import {
  endpointIdForKey,
  endpointKey,
  type EndpointId,
} from "./api/endpoints";
import { cached, markAccessChanged } from "./cache";
import { query } from "./db/pool";
import { isSuperAdmin, type UserRow } from "./users";

interface RoleAccess {
  pages: Set<string>;
  /** granted "METHOD /path" entries */
  endpoints: Set<string>;
  /** the role's own grants: "permissionId:action" */
  grants: Set<string>;
}

// Role → granted pages/endpoints, cached for a day so access checks don't hit the database on
// every request — dropped (on every instance) as soon as roles, cards, platforms or managers
// change (see cache.ts).
const DAY_MS = 24 * 60 * 60 * 1000;

/** Roles / cards / platforms / managers changed: cached access is dropped after this request. */
export function invalidateAccessCache() {
  markAccessChanged();
}

function loadRoleAccess(roleId: number): Promise<RoleAccess> {
  return cached(`role-access:${roleId}`, DAY_MS, "access", async () => {
    // URLs whose card the role holds an action on, where that action is one the URL is used for.
    const [{ rows }, { rows: grants }] = await Promise.all([
      query<{ kind: "page" | "api"; method: string | null; path: string }>(
        `SELECT DISTINCT u.kind, u.method, u.path
           FROM role_permission_actions g
           JOIN roles r ON r.id = g.role_id AND r.is_active -- an inactive role grants nothing
           JOIN permission_urls u ON u.permission_id = g.permission_id
           JOIN permission_url_actions a ON a.permission_url_id = u.id AND a.action = g.action
          WHERE g.role_id = $1`,
        [roleId],
      ),
      query<{ permission_id: number; action: Action }>(
        `SELECT g.permission_id, g.action
           FROM role_permission_actions g JOIN roles r ON r.id = g.role_id AND r.is_active
          WHERE g.role_id = $1`,
        [roleId],
      ),
    ]);
    return {
      pages: new Set(rows.filter((r) => r.kind === "page").map((r) => r.path)),
      endpoints: new Set(rows.filter((r) => r.kind === "api").map((r) => `${r.method} ${r.path}`)),
      grants: new Set(grants.map((g) => `${g.permission_id}:${g.action}`)),
    };
  });
}

/** For the UI: granted page paths, endpoint ids, and the card × action grants held. */
export async function getUserAccess(user: UserRow): Promise<AccessInfo> {
  if (isSuperAdmin(user))
    return { superAdmin: true, pages: [], endpoints: [], grants: [] };
  if (!user.role_id)
    return { superAdmin: false, pages: [], endpoints: [], grants: [] };
  const access = await loadRoleAccess(user.role_id);
  const ids = [...access.endpoints]
    .map(endpointIdForKey)
    .filter((id) => id !== undefined);
  return {
    superAdmin: false,
    pages: [...access.pages],
    endpoints: ids,
    grants: [...access.grants],
  };
}

/**
 * The card × action pairs ("permissionId:action") a user holds through their role on the
 * active platform; null = everything (super admin). Roles can only be changed within these.
 */
export async function heldGrants(user: UserRow): Promise<Set<string> | null> {
  if (isSuperAdmin(user)) return null;
  if (!user.role_id) return new Set();
  return (await loadRoleAccess(user.role_id)).grants;
}

/** Cards grant "METHOD /path"; the endpoint is allowed if its method + path is granted. */
export async function canUseEndpoint(user: UserRow, endpointId: EndpointId) {
  if (isSuperAdmin(user)) return true;
  if (!user.role_id) return false;
  return (await loadRoleAccess(user.role_id)).endpoints.has(
    endpointKey(endpointId),
  );
}
