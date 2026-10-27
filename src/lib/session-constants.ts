// Shared by the API, the proxy and the UI (no server-only imports here).
export const SESSION_COOKIE = "pay_session";
export const LOCALE_COOKIE = "pay_locale";

export interface SessionClaims {
  sub: string;
  ver: number;
  /** must change password */
  mcp: boolean;
  /** active platform id (null when none) */
  pid?: string | null;
}

export function jwtSecretKey() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "");
}
