import "server-only";
import { query } from "./db/pool";
import { ApiError } from "./errors";
import { activePlatform, type UserRow } from "./users";

// Platform + app scope for an app's data (users, devices, orders). Resolved by route() for
// every endpoint marked `scope: true`, before the handler runs:
//   - platform: always the session's active one (picked in the platform switcher) — for
//     everyone, super admins included. A user can belong to several platforms with a
//     different role on each, so the page also sends the platform it shows
//     (`X-Platform-Id`): if the session moved on (switched in another tab), the request is
//     refused with PLATFORM_CHANGED instead of landing on the other platform.
//   - app: when `appId` is given it must belong to that platform.

export interface Scope {
  platformId: string;
  appId?: number;
}

/** Header a page sends with the platform it was showing. */
export const PLATFORM_HEADER = "x-platform-id";

export async function resolveScope(
  user: UserRow,
  input: { appId?: unknown },
  shownPlatform: string | null,
): Promise<Scope> {
  const platformId = activePlatform(user);
  if (shownPlatform && shownPlatform !== platformId)
    throw new ApiError(409, "PLATFORM_CHANGED");
  const appId = typeof input.appId === "number" ? input.appId : undefined;
  if (appId !== undefined) {
    const { rowCount } = await query(
      "SELECT 1 FROM apps WHERE id = $1 AND platform_id = $2",
      [appId, platformId],
    );
    if (!rowCount) throw new ApiError(400, "INVALID_APP");
  }
  return { platformId, appId };
}
