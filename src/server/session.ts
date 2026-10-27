import "server-only";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { getConfig } from "./config";
import { findById, type UserRow } from "./users";
import {
  jwtSecretKey,
  SESSION_COOKIE,
  type SessionClaims,
} from "@/lib/session-constants";

/** Issues the session cookie; `platformId` is the active platform (null if none). */
export async function createSession(
  user: Pick<UserRow, "id" | "token_version" | "must_change_password">,
  platformId: string | null,
) {
  const { SESSION_TTL_HOURS, NODE_ENV } = getConfig();
  const token = await new SignJWT({
    ver: user.token_version,
    mcp: user.must_change_password,
    pid: platformId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(jwtSecretKey());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, jwtSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Resolves the logged-in user from the cookie, with their role on the session's active
 * platform. The token's version must match the DB, so logout / password change / disabling
 * revoke existing sessions; a user who no longer belongs to any platform is signed out.
 */
export async function getSessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  if (!claims?.sub) return null;

  const user = await findById(Number(claims.sub), claims.pid ?? null);
  // (a user without a usable platform is returned with role_id null; requireUser rejects it)
  if (!user || !user.is_active || user.token_version !== claims.ver)
    return null;
  return user;
}
