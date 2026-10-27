import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { resolveTargetPlatform } from "@/server/users";

/** Roles of the active platform (or `platformId`), for pickers. Built-in Manager first. */
export const GET = route("roles.options", async ({ user, query: q }) => {
  // the picker is used when adding managers, so the same rule as managers.create applies
  const platformId = await resolveTargetPlatform(
    user,
    q.platformId,
    "managers.create",
  );
  const { rows } = await query<{
    id: number;
    key: string | null;
    name: string;
  }>(
    `SELECT id, key, name FROM roles WHERE platform_id = $1
      ORDER BY key = 'manager' DESC NULLS LAST, LOWER(name)`,
    [platformId],
  );
  return json({ roles: rows });
});
