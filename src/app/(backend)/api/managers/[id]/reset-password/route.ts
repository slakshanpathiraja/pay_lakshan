import bcrypt from "bcryptjs";
import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { generateTemporaryPassword } from "@/server/password";
import { assertManagesWholeAccount, assertNotSelf, findPublicUser } from "@/server/users";

/** Sets a temporary password (given or generated); the manager must change it on next login. */
export const POST = route(
  "managers.resetPassword",
  async ({ user, params, body }) => {
    assertNotSelf(user, params.id);
    await assertManagesWholeAccount(user, params.id);
    const temporaryPassword = body.password || generateTemporaryPassword();
    await query(
      `UPDATE users
       SET password_hash = $1, must_change_password = TRUE,
           token_version = token_version + 1, updated_at = now()
     WHERE id = $2`,
      [await bcrypt.hash(temporaryPassword, 12), params.id],
    );
    return json({
      user: await findPublicUser(params.id, user.platform_id),
      temporaryPassword,
    });
  },
);
