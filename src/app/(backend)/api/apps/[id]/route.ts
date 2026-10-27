import { route } from "@/server/api/route";
import { toPublicApp, type AppRow } from "@/server/apps";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { activePlatform } from "@/server/users";

/** Changes an app's name / identifier (the key and secret stay); other platforms' apps are "not found". */
export const PUT = route("apps.update", async ({ req, user, params, body }) => {
  try {
    const { rows } = await query<AppRow>(
      `UPDATE apps SET name = $1, kind = $2, identifier = $3, updated_at = now()
        WHERE id = $4 AND platform_id = $5 RETURNING *`,
      [body.name, body.kind, body.identifier, params.id, activePlatform(user)],
    );
    if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
    return json({
      app: toPublicApp(rows[0]),
      message: messageFor(req, "notices.appUpdated", { name: rows[0].name }),
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ApiError(409, "APP_TAKEN");
    throw err;
  }
});

export const DELETE = route("apps.delete", async ({ user, params }) => {
  const { rowCount } = await query(
    "DELETE FROM apps WHERE id = $1 AND platform_id = $2",
    [params.id, activePlatform(user)],
  );
  if (!rowCount) throw new ApiError(404, "NOT_FOUND");
  return new Response(null, { status: 204 });
});
