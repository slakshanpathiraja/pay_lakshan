import bcrypt from "bcryptjs";
import { route } from "@/server/api/route";
import { issueTokens, verifySignedRequest } from "@/server/app-api";
import { mapDbError, USER_UNIQUE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { enqueueEmail } from "@/server/email/outbox";
import { verifyGoogleIdToken } from "@/server/google-signin";
import { ApiError, json } from "@/server/http";
import { clientIp, hitRateLimit } from "@/server/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

type AppUserRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  is_active: boolean;
};
const COLUMNS = "id, name, email, password_hash, google_sub, is_active";

/**
 * Signs the app's user in, or signs them up when the app doesn't have the email yet — with
 * email + password, or with a Google ID token ("Sign in with Google": the account the user
 * picked on the device; Google has verified its email, so no password).
 * A user added in the dashboard (no password yet) sets it on the first call, or links their
 * Google account. A new user gets a welcome email (queued; sent after the response).
 * `mode` (email + password only): `signin` refuses an unknown email instead of signing it up;
 * `signup` refuses an email that already has an account, unless the password is its own.
 */
export const POST = route("appApi.user", async ({ req, body }) => {
  const app = await verifySignedRequest(body);
  const google = body.googleIdToken ? await verifyGoogleIdToken(body.googleIdToken, app.id) : null;
  const email = google?.email ?? body.email!.trim().toLowerCase();
  if (
    (await hitRateLimit(`app-login:${app.id}:${email}`, 10, WINDOW_MS)) ||
    (await hitRateLimit(`app-login-ip:${clientIp(req)}`, 100, WINDOW_MS))
  ) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS");
  }

  // a Google account is found by its id first (its email may have changed since)
  const { rows } = await query<AppUserRow>(
    `SELECT ${COLUMNS} FROM app_users
      WHERE app_id = $1 AND (LOWER(email) = $2 OR ($3 IS NOT NULL AND google_sub = $3))
      ORDER BY (google_sub IS $3) DESC
      LIMIT 1`,
    [app.id, email, google?.sub ?? null],
  );
  let user = rows[0];
  let created = false;
  if (!user && body.mode === "signin") throw new ApiError(401, "APP_USER_LOGIN_FAILED");
  if (!user) {
    try {
      const { rows: inserted } = await query<AppUserRow>(
        `INSERT INTO app_users (platform_id, app_id, name, email, password_hash, google_sub)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
        [
          app.platform_id,
          app.id,
          google?.name ?? email,
          email,
          google ? null : await bcrypt.hash(body.password!, 12),
          google?.sub ?? null,
        ],
      );
      user = inserted[0];
      created = true;
    } catch (err) {
      mapDbError(err, { unique: { ...USER_UNIQUE, app_users_google_sub_key: "APP_USER_LOGIN_FAILED" } }); // signed up twice at once
    }
  } else if (google) {
    // the email's owner, proven by Google: link the account (another Google account → refused)
    if (user.google_sub && user.google_sub !== google.sub) throw new ApiError(401, "APP_USER_LOGIN_FAILED");
    if (!user.google_sub) {
      await query("UPDATE app_users SET google_sub = $1, updated_at = now() WHERE id = $2", [google.sub, user.id]);
    }
  } else if (!user.password_hash) {
    // a Google user has no password: one can't be set by anyone who knows their email
    if (user.google_sub) throw new ApiError(401, "APP_USER_USE_GOOGLE");
    await query("UPDATE app_users SET password_hash = $1, updated_at = now() WHERE id = $2", [
      await bcrypt.hash(body.password!, 12),
      user.id,
    ]);
  } else if (!(await bcrypt.compare(body.password!, user.password_hash))) {
    if (body.mode === "signup") throw new ApiError(409, "APP_USER_EXISTS");
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
