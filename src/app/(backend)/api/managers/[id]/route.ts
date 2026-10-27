import { route } from "@/server/api/route";
import { withTransaction } from "@/server/db/pool";
import {
  activePlatform,
  assertMemberOfActivePlatform,
  assertNotSelf,
} from "@/server/users";

/**
 * Removes the manager from the active platform. If that was their last platform the
 * account is deleted (it could no longer sign in).
 */
export const DELETE = route("managers.delete", async ({ user, params }) => {
  assertNotSelf(user, params.id);
  await assertMemberOfActivePlatform(user, params.id);
  await withTransaction(async (client) => {
    await client.query(
      "DELETE FROM user_platforms WHERE user_id = $1 AND platform_id = $2",
      [params.id, activePlatform(user)],
    );
    await client.query(
      `DELETE FROM users u WHERE u.id = $1 AND u.role_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_platforms up WHERE up.user_id = u.id)`,
      [params.id],
    );
  });
  return new Response(null, { status: 204 });
});
