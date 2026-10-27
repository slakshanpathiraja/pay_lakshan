import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { findPublicUser } from "@/server/users";

/** Any signed-in user can update their own name and email. Username and role are fixed. */
export const PATCH = route("auth.updateProfile", async ({ user, body }) => {
  try {
    await query(
      `UPDATE users SET full_name = $1, email = $2, updated_at = now() WHERE id = $3`,
      [body.fullName || null, body.email, user.id],
    );
    return json({ user: await findPublicUser(user.id, user.platform_id) });
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new ApiError(409, "EMAIL_TAKEN");
    throw err;
  }
});
