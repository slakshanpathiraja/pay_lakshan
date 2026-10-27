import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { PLATFORM_SELECT, type PlatformRow } from "@/server/platforms";
import { activePlatform, userPlatforms } from "@/server/users";

/** The platform the user is working in, for the "My platform" page. */
export const GET = route("platforms.current", async ({ user }) => {
  const { rows } = await query<PlatformRow>(
    `SELECT ${PLATFORM_SELECT} WHERE p.id = $1`,
    [activePlatform(user)],
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
  return json({
    platform: rows[0],
    role: { id: user.role_id, key: user.role_key, name: user.role_name },
    platformCount: (await userPlatforms(user)).length,
  });
});

/** Renames the platform the user is working in — only that one (own platform update). */
export const PUT = route("platforms.updateOwn", async ({ req, user, body }) => {
  const platformId = activePlatform(user);
  try {
    await query(
      "UPDATE platforms SET name = $1, updated_at = now() WHERE id = $2",
      [body.name, platformId],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ApiError(409, "PLATFORM_NAME_TAKEN");
    throw err;
  }
  const { rows } = await query<PlatformRow>(
    `SELECT ${PLATFORM_SELECT} WHERE p.id = $1`,
    [platformId],
  );
  return json({
    platform: rows[0],
    message: messageFor(req, "notices.platformRenamed", { name: rows[0].name }),
  });
});
