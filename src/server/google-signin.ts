import "server-only";
import { jwtVerify } from "jose";
import { query } from "./db/pool";
import { ApiError } from "./errors";
import { googleKeys } from "./google-play";

export interface GoogleAccount {
  /** Google's id for the account — stays the same when the email changes */
  sub: string;
  email: string;
  name: string | null;
}

/**
 * Checks an ID token an app got from "Sign in with Google": signed by Google, issued for one of
 * this app's client ids (App config — so a token another app received is refused), not
 * expired, with an email Google has verified.
 */
export async function verifyGoogleIdToken(token: string, appId: number): Promise<GoogleAccount> {
  const { rows } = await query<{ ids: string[] }>("SELECT google_client_ids AS ids FROM apps WHERE id = $1", [appId]);
  const audience = rows[0]?.ids ?? [];
  if (!audience.length) throw new ApiError(503, "GOOGLE_SIGNIN_NOT_CONFIGURED");
  try {
    const { payload } = await jwtVerify<{ email?: string; email_verified?: boolean; name?: string }>(
      token,
      googleKeys,
      { issuer: ["https://accounts.google.com", "accounts.google.com"], audience },
    );
    if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error("no verified email");
    return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name?.trim() || null };
  } catch {
    throw new ApiError(401, "GOOGLE_TOKEN_INVALID");
  }
}
