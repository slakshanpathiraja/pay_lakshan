import { getUserAccess } from "@/server/access";
import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { createSession } from "@/server/session";
import {
  canUsePlatform,
  findById,
  isSuperAdmin,
  toPublicUser,
  userPlatforms,
} from "@/server/users";

/** Switches the active platform: the session is re-issued and the role on that platform applies. */
export const POST = route("auth.switchPlatform", async ({ user, body }) => {
  const allowed = isSuperAdmin(user)
    ? !!(
        await query("SELECT 1 FROM platforms WHERE id = $1", [body.platformId])
      ).rowCount
    : await canUsePlatform(user.id, body.platformId); // member of an active platform
  if (!allowed) throw new ApiError(403, "FORBIDDEN");

  await query("UPDATE users SET last_platform_id = $1 WHERE id = $2", [
    body.platformId,
    user.id,
  ]);
  await createSession(user, body.platformId);
  const next = (await findById(user.id, body.platformId))!;
  return json({
    user: toPublicUser(next),
    access: await getUserAccess(next),
    platforms: await userPlatforms(next),
  });
});
