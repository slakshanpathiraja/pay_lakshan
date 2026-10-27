// Shared (client + server) access model.
//
// - Users with the built-in Super Admin role have full access.
// - Every other user gets access from their role. A role is a set of permission
//   "cards"; each card grants frontend page paths and backend endpoint ids.
// - Pages and endpoints also declare a base access level in code (see the menu
//   catalog in src/utils/menu.ts and the API catalog in src/server/api/endpoints.ts).

/**
 * - public:        no sign-in needed
 * - pending:       signed in, even with a temporary password (setup / me / logout)
 * - authenticated: any signed-in user
 * - permission:    must be granted through a role's permission cards (super admins have all)
 */
export type AccessLevel = "public" | "pending" | "authenticated" | "permission";

/** What the signed-in user may use; returned by GET /api/auth/me. */
export interface AccessInfo {
  superAdmin: boolean;
  /** granted page paths (only meaningful when not super admin) */
  pages: string[];
  /** granted endpoint ids (only meaningful when not super admin) */
  endpoints: string[];
  /** card × action pairs held, as "permissionId:action" — roles can only be edited within these */
  grants: string[];
}

export function hasAccess(
  level: AccessLevel,
  access: AccessInfo | null | undefined,
  grant: { page?: string; endpoint?: string },
): boolean {
  if (level === "public") return true;
  if (!access) return false;
  if (access.superAdmin) return true;
  if (level === "pending" || level === "authenticated") return true;
  if (grant.page) return access.pages.includes(grant.page);
  if (grant.endpoint) return access.endpoints.includes(grant.endpoint);
  return false;
}

/**
 * What a URL on a permission card is used for. A role is granted actions per card
 * (role × card × action); it may use a URL when it holds one of the URL's actions.
 */
export const ACTIONS = ["view", "create", "edit", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/** Sorts actions into the canonical view → create → edit → delete order. */
export function sortActions<T extends string>(actions: Iterable<T>): T[] {
  return [...new Set(actions)].sort(
    (a, b) => ACTIONS.indexOf(a as Action) - ACTIONS.indexOf(b as Action),
  );
}

/**
 * Actions are levels: view < create < edit < delete, and a level includes the ones below
 * it. Granting a level gives every action the card offers up to that level.
 */
export function actionsUpTo(
  level: Action | null,
  offered: readonly Action[],
): Action[] {
  if (!level) return [];
  const max = ACTIONS.indexOf(level);
  return sortActions(offered.filter((a) => ACTIONS.indexOf(a) <= max));
}

/** The highest level among `actions` (null when empty). */
export function topAction(actions: readonly Action[]): Action | null {
  return sortActions(actions).at(-1) ?? null;
}

/** Permission card keys: lowercase letters, numbers, dot, dash, underscore. */
export const PERMISSION_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;

/** Suggests a key from a card name, e.g. "SMTP servers" → "smtp-servers". */
export function keyFromName(name: string) {
  const key = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return key || "permission";
}
