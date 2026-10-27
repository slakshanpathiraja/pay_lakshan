import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { clearSession, getSessionUser } from "@/server/session";

export const POST = route("auth.logout", async () => {
  const user = await getSessionUser();
  if (user) {
    // Bumping the version revokes the token server-side, not just in this browser.
    await query(
      "UPDATE users SET token_version = token_version + 1 WHERE id = $1",
      [user.id],
    );
  }
  await clearSession();
  return json({ ok: true });
});
