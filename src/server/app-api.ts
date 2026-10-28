import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { getConfig } from "./config";
import { decryptSecret } from "./crypto";
import { query } from "./db/pool";
import { canonicalString } from "@/lib/app-api-docs";
import { ApiError } from "./errors";

// The App API (/api/webhooks/*) — called by a platform's apps, not by managers.
//
// Signed requests: every parameter is a string. The app sorts the parameters by name (all
// but `signature`), joins them as `name=value` with `&` (values as they are, not
// URL-encoded), and signs that text with HMAC-SHA256 using its app secret; the hex digest
// goes in `signature`. `timestamp` (Unix seconds) must be within 5 minutes of the server's
// clock, so a captured request can't be replayed later.
//
//   appKey=ak_…&email=a@b.com&password=…&timestamp=1767225600   → HMAC-SHA256(secret) → signature
//
// Users: POST /user returns a 1-hour access token (sent as `Authorization: Bearer …` to
// /device, /order and /verify) and a 30-day refresh token for POST /refresh.

export const SIGNATURE_WINDOW_S = 5 * 60;
export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
/** a refresh token closer than this to its end is replaced by a new one on refresh */
export const REFRESH_ROTATE_DAYS = 7;

export interface ApiApp {
  id: number;
  platform_id: string;
  name: string;
}

export function signParams(params: Record<string, string | undefined>, secret: string) {
  return createHmac("sha256", secret).update(canonicalString(params)).digest("hex");
}

/**
 * The app behind `appKey`, once the request's timestamp and signature check out. Its
 * platform must be active.
 */
export async function verifySignedRequest(params: Record<string, string | undefined>): Promise<ApiApp> {
  const { rows } = await query<ApiApp & { app_secret: string; platform_active: boolean }>(
    `SELECT a.id, a.platform_id, a.name, a.app_secret, p.is_active AS platform_active
       FROM apps a JOIN platforms p ON p.id = a.platform_id
      WHERE a.app_key = $1`,
    [params.appKey ?? ""],
  );
  const app = rows[0];
  if (!app) throw new ApiError(401, "INVALID_APP_KEY");
  const timestamp = Number(params.timestamp);
  if (!Number.isInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_WINDOW_S) {
    throw new ApiError(401, "REQUEST_EXPIRED");
  }
  const expected = Buffer.from(signParams(params, decryptSecret(app.app_secret)), "hex");
  const given = Buffer.from(/^[0-9a-f]{64}$/i.test(params.signature ?? "") ? params.signature! : "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new ApiError(401, "INVALID_SIGNATURE");
  }
  if (!app.platform_active) throw new ApiError(403, "APP_UNAVAILABLE");
  return { id: app.id, platform_id: app.platform_id, name: app.name };
}

// --- tokens ---------------------------------------------------------------------------------

/** Its own key (from JWT_SECRET), so an app user's token can never pass as a manager session. */
function accessKey() {
  return createHmac("sha256", getConfig().JWT_SECRET).update("app-api:access-token").digest();
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function newAccessToken(appUserId: number, appId: number) {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_S * 1000);
  const token = await new SignJWT({ app: appId, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(appUserId))
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(accessKey());
  return { accessToken: token, accessTokenExpiresAt: expiresAt.toISOString() };
}

async function newRefreshToken(appUserId: number, appId: number) {
  const token = `rt_${randomBytes(32).toString("base64url")}`;
  const { rows } = await query<{ expires_at: Date }>(
    `INSERT INTO app_user_tokens (app_user_id, app_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now('+' || $4 || ' days')) RETURNING expires_at`,
    [appUserId, appId, hashToken(token), REFRESH_TOKEN_TTL_DAYS],
  );
  return { refreshToken: token, refreshTokenExpiresAt: rows[0].expires_at.toISOString() };
}

/** After sign in: a 1-hour access token and a 30-day refresh token. */
export async function issueTokens(appUserId: number, appId: number) {
  return {
    ...(await newAccessToken(appUserId, appId)),
    ...(await newRefreshToken(appUserId, appId)),
  };
}

export interface ApiUser {
  id: number;
  name: string;
  email: string | null;
}

/** The signed-in user from `Authorization: Bearer <access token>`: of this app, and active. */
export async function requireApiUser(req: Request, app: ApiApp): Promise<ApiUser> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new ApiError(401, "INVALID_TOKEN");
  let claims;
  try {
    claims = (await jwtVerify<{ app: number; typ: string }>(token, accessKey(), { algorithms: ["HS256"] }))
      .payload;
  } catch {
    throw new ApiError(401, "INVALID_TOKEN");
  }
  if (claims.typ !== "access" || claims.app !== app.id) throw new ApiError(401, "INVALID_TOKEN");
  const { rows } = await query<ApiUser & { is_active: boolean }>(
    "SELECT id, name, email, is_active FROM app_users WHERE id = $1 AND app_id = $2",
    [Number(claims.sub), app.id],
  );
  const user = rows[0];
  if (!user) throw new ApiError(401, "INVALID_TOKEN");
  if (!user.is_active) throw new ApiError(403, "ACCOUNT_DISABLED");
  return { id: user.id, name: user.name, email: user.email };
}

/**
 * A new access token for a refresh token. The refresh token is kept until it gets close to
 * its end (REFRESH_ROTATE_DAYS): then it is replaced — the old one stops working and the new
 * one comes back as `refreshToken`.
 */
export async function refreshAccess(refreshToken: string, app: ApiApp) {
  const { rows } = await query<{ id: number; app_user_id: number; expires_at: Date; is_active: boolean }>(
    `SELECT t.id, t.app_user_id, t.expires_at, u.is_active
       FROM app_user_tokens t JOIN app_users u ON u.id = t.app_user_id
      WHERE t.token_hash = $1 AND t.app_id = $2 AND t.revoked_at IS NULL AND t.expires_at > now()`,
    [hashToken(refreshToken), app.id],
  );
  const stored = rows[0];
  if (!stored) throw new ApiError(401, "INVALID_REFRESH_TOKEN");
  if (!stored.is_active) throw new ApiError(403, "ACCOUNT_DISABLED");
  const access = await newAccessToken(stored.app_user_id, app.id);
  const rotate = stored.expires_at.getTime() - Date.now() < REFRESH_ROTATE_DAYS * 86_400_000;
  if (!rotate) {
    await query("UPDATE app_user_tokens SET last_used_at = now() WHERE id = $1", [stored.id]);
    return {
      ...access,
      refreshToken: null,
      refreshTokenExpiresAt: stored.expires_at.toISOString(),
      refreshTokenRotated: false,
    };
  }
  // only one request can revoke it: a token used twice at once doesn't give two new ones
  const { rowCount } = await query(
    "UPDATE app_user_tokens SET revoked_at = now(), last_used_at = now() WHERE id = $1 AND revoked_at IS NULL",
    [stored.id],
  );
  if (!rowCount) throw new ApiError(401, "INVALID_REFRESH_TOKEN");
  return { ...access, ...(await newRefreshToken(stored.app_user_id, app.id)), refreshTokenRotated: true };
}
