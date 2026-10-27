import bcrypt from "bcryptjs";
import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { clientIp, hitRateLimit } from "@/server/rate-limit";
import { createSession } from "@/server/session";
import {
  findById,
  findByUsername,
  platformProblem,
  toPublicUser,
} from "@/server/users";

// Compared against when the username doesn't exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);

export const POST = route("auth.login", async ({ req, body }) => {
  if (hitRateLimit(`login:${clientIp(req)}`, 20, 15 * 60 * 1000)) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS");
  }

  const user = await findByUsername(body.username);
  const ok = await bcrypt.compare(
    body.password,
    user?.password_hash ?? DUMMY_HASH,
  );

  if (!user || !ok) throw new ApiError(401, "INVALID_CREDENTIALS");
  if (!user.is_active) throw new ApiError(403, "ACCOUNT_DISABLED");

  // Effective role on the last used (or first) active platform. No active platform = no sign-in:
  // PLATFORM_INACTIVE when all of the account's platforms are inactive, NO_PLATFORM when it has none.
  const full = await findById(user.id);
  if (!full?.role_id) throw new ApiError(403, await platformProblem(user.id));

  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [
    user.id,
  ]);
  await createSession(full, full.platform_id);
  return json({ user: toPublicUser(full) });
});
