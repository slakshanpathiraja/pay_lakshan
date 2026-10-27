import { getUserAccess } from "@/server/access";
import { route } from "@/server/api/route";
import { json } from "@/server/http";
import { toPublicUser, userPlatforms } from "@/server/users";

/**
 * The signed-in user (with their role on the active platform), what they may access, and
 * the platforms they can switch to. Drives the menu, page guards and platform switcher.
 */
export const GET = route("auth.me", async ({ user }) => {
  return json({
    user: toPublicUser(user),
    access: await getUserAccess(user),
    platforms: await userPlatforms(user),
  });
});
