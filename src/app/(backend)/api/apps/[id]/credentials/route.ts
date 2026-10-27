import { route } from "@/server/api/route";
import { credentialsOf, type AppRow } from "@/server/apps";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { activePlatform } from "@/server/users";

/** The full key and secret of an app on the active platform. */
export const GET = route("apps.credentials", async ({ user, params }) => {
  const { rows } = await query<AppRow>(
    "SELECT * FROM apps WHERE id = $1 AND platform_id = $2",
    [params.id, activePlatform(user)],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
  return json({
    app: { id: rows[0].id, name: rows[0].name },
    credentials: credentialsOf(rows[0]),
  });
});
