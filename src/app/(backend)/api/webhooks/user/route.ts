import bcrypt from "bcryptjs";
import { route } from "@/server/api/route";
import { issueTokens, verifySignedRequest } from "@/server/app-api";
import { mapDbError, USER_UNIQUE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { enqueueEmail } from "@/server/email/outbox";
import { ApiError, json } from "@/server/http";
import { clientIp, hitRateLimit } from "@/server/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Signs the app's user in with email + password, or signs them up when the app doesn't have
 * the email yet. A user added in the dashboard (no password yet) sets it on the first call.
 * A new user gets a welcome email (queued; sent after the response).
 */
export const POST = route("appApi.user", async ({ req, body }) => {
  const app = await verifySignedRequest(body);
  const email = body.email.trim().toLowerCase();
  if (
    hitRateLimit(`app-login:${app.id}:${email}`, 10, WINDOW_MS) ||
    hitRateLimit(`app-login-ip:${clientIp(req)}`, 100, WINDOW_MS)
  ) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS");
  }

  const { rows } = await query<{
    id: number;
    name: string;
    email: string;
    password_hash: string | null;
    is_active: boolean;
  }>(
    "SELECT id, name, email, password_hash, is_active FROM app_users WHERE app_id = $1 AND LOWER(email) = $2",
    [app.id, email],
  );
  let user = rows[0];
  let created = false;
  if (!user) {
    try {
      const { rows: inserted } = await query<typeof user>(
        `INSERT INTO app_users (platform_id, app_id, name, email, password_hash)
         VALUES ($1, $2, $3, $3, $4) RETURNING id, name, email, password_hash, is_active`,
        [app.platform_id, app.id, email, await bcrypt.hash(body.password, 12)],
      );
      user = inserted[0];
      created = true;
    } catch (err) {
      mapDbError(err, { unique: USER_UNIQUE }); // signed up twice at once
    }
  } else if (!user.password_hash) {
    await query("UPDATE app_users SET password_hash = $1, updated_at = now() WHERE id = $2", [
      await bcrypt.hash(body.password, 12),
      user.id,
    ]);
  } else if (!(await bcrypt.compare(body.password, user.password_hash))) {
    throw new ApiError(401, "APP_USER_LOGIN_FAILED");
  }
  if (!user.is_active) throw new ApiError(403, "ACCOUNT_DISABLED");
  if (created) {
    await enqueueEmail({
      platformId: app.platform_id,
      template: "welcome",
      to: user.email,
      data: { appUserId: user.id, appId: app.id },
    });
  }

  return json(
    {
      user: { id: user.id, name: user.name, email: user.email },
      created,
      ...(await issueTokens(user.id, app.id)),
    },
    created ? 201 : 200,
  );
});
