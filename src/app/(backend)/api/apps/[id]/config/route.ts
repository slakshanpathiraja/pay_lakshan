import { route } from "@/server/api/route";
import type { AppRow } from "@/server/apps";
import { query, withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { activePlatform } from "@/server/users";

type ConfigApp = Pick<AppRow, "id" | "name" | "kind" | "identifier">;

/** The app (of the active platform) with its webhooks and redirects; 404 for other platforms' apps. */
async function loadConfig(appId: number, platformId: string) {
  const { rows } = await query<ConfigApp>(
    "SELECT id, name, kind, identifier FROM apps WHERE id = $1 AND platform_id = $2",
    [appId, platformId],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
  const [webhooks, redirects] = await Promise.all([
    query<{ url: string }>(
      "SELECT url FROM app_webhooks WHERE app_id = $1 ORDER BY id",
      [appId],
    ),
    query<{ status: string; url: string }>(
      "SELECT status, url FROM app_redirects WHERE app_id = $1",
      [appId],
    ),
  ]);
  return { app: rows[0], webhooks: webhooks.rows, redirects: redirects.rows };
}

export const GET = route("apps.config", async ({ user, params }) => {
  return json(await loadConfig(params.id, activePlatform(user)));
});

/** Replaces the app's webhooks and redirects. */
export const PUT = route(
  "apps.updateConfig",
  async ({ req, user, params, body }) => {
    const platformId = activePlatform(user);
    const { app } = await loadConfig(params.id, platformId);
    await withTransaction(async (client) => {
      await client.query("DELETE FROM app_webhooks WHERE app_id = $1", [
        app.id,
      ]);
      await client.query("DELETE FROM app_redirects WHERE app_id = $1", [
        app.id,
      ]);
      for (const w of body.webhooks) {
        await client.query(
          "INSERT INTO app_webhooks (app_id, url) VALUES ($1, $2)",
          [app.id, w.url],
        );
      }
      for (const r of body.redirects) {
        await client.query(
          "INSERT INTO app_redirects (app_id, status, url) VALUES ($1, $2, $3)",
          [app.id, r.status, r.url],
        );
      }
    });
    return json({
      ...(await loadConfig(app.id, platformId)),
      message: messageFor(req, "notices.appConfigSaved", { name: app.name }),
    });
  },
);
