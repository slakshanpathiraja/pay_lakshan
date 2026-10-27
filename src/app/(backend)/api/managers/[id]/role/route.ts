import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import {
  activePlatform,
  assertMemberOfActivePlatform,
  assertNotSelf,
  assertRoleOnPlatform,
  findPublicUser,
} from "@/server/users";

/** Changes the manager's role on the active platform (their roles elsewhere are unchanged). */
export const PATCH = route(
  "managers.updateRole",
  async ({ user, params, body }) => {
    assertNotSelf(user, params.id);
    await assertMemberOfActivePlatform(user, params.id);
    const platformId = activePlatform(user);
    await assertRoleOnPlatform(body.roleId, platformId);
    await query(
      "UPDATE user_platforms SET role_id = $1 WHERE user_id = $2 AND platform_id = $3",
      [body.roleId, params.id, platformId],
    );
    return json({ user: await findPublicUser(params.id, platformId) });
  },
);
