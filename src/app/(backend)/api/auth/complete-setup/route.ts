import bcrypt from "bcryptjs";
import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { createSession } from "@/server/session";
import { findPublicUser, type UserRow } from "@/server/users";

/**
 * First sign in (or after an admin reset): the user is already authenticated with the
 * temporary password, so the current password isn't asked again. Collects their email.
 */
export const POST = route("auth.completeSetup", async ({ user, body }) => {
  if (!user.must_change_password) throw new ApiError(400, "SETUP_NOT_REQUIRED");
  if (await bcrypt.compare(body.newPassword, user.password_hash)) {
    throw new ApiError(400, "PASSWORD_REUSED");
  }

  const hash = await bcrypt.hash(body.newPassword, 12);
  try {
    const { rows } = await query<UserRow>(
      `UPDATE users
         SET email = $1, password_hash = $2, must_change_password = FALSE,
             token_version = token_version + 1, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [body.email, hash, user.id],
    );
    await createSession(rows[0], user.platform_id);
    return json({ user: await findPublicUser(user.id, user.platform_id) });
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ApiError(409, "EMAIL_TAKEN");
    throw err;
  }
});
