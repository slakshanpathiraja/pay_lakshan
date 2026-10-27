import bcrypt from "bcryptjs";
import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { createSession } from "@/server/session";
import { findPublicUser, type UserRow } from "@/server/users";

// Any signed-in user can change their own password.
export const POST = route("auth.changePassword", async ({ user, body }) => {
  if (!(await bcrypt.compare(body.currentPassword, user.password_hash))) {
    throw new ApiError(400, "INVALID_CURRENT_PASSWORD");
  }
  if (await bcrypt.compare(body.newPassword, user.password_hash)) {
    throw new ApiError(400, "PASSWORD_REUSED");
  }

  const hash = await bcrypt.hash(body.newPassword, 12);
  const { rows } = await query<UserRow>(
    `UPDATE users
       SET password_hash = $1, must_change_password = FALSE,
           token_version = token_version + 1, updated_at = now()
     WHERE id = $2 RETURNING *`,
    [hash, user.id],
  );
  // Other sessions are revoked; keep this one alive with a fresh token.
  await createSession(rows[0], user.platform_id);
  return json({ user: await findPublicUser(user.id, user.platform_id) });
});
