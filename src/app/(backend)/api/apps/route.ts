import { route } from "@/server/api/route";
import { generateCredentials, toPublicApp, type AppRow } from "@/server/apps";
import { encryptSecret } from "@/server/crypto";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { activePlatform } from "@/server/users";

/** The active platform's apps (key and secret masked). */
export const GET = route("apps.list", async ({ scope }) => {
  const { rows } = await query<AppRow>(
    "SELECT * FROM apps WHERE platform_id = $1 ORDER BY LOWER(name), id",
    [scope.platformId],
  );
  return json({ apps: rows.map(toPublicApp) });
});

/** Adds a website (domain) or mobile app (app id) to the active platform with a new key and secret. */
export const POST = route("apps.create", async ({ req, user, body }) => {
  const credentials = generateCredentials();
  try {
    const { rows } = await query<AppRow>(
      `INSERT INTO apps (platform_id, name, kind, identifier, app_key, app_secret)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        activePlatform(user),
        body.name,
        body.kind,
        body.identifier,
        credentials.appKey,
        encryptSecret(credentials.appSecret),
      ],
    );
    return json(
      {
        app: toPublicApp(rows[0]),
        credentials,
        message: messageFor(req, "notices.appCreated", { name: rows[0].name }),
      },
      201,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ApiError(409, "APP_TAKEN");
    throw err;
  }
});
