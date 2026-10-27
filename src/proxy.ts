import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  jwtSecretKey,
  SESSION_COOKIE,
  type SessionClaims,
} from "@/lib/session-constants";

const PUBLIC_PATHS = ["/login"];
/** Pages for anyone, signed in or not: where Stripe sends a customer back after paying. */
const OPEN_PREFIXES = ["/checkout/"];
const CHANGE_PASSWORD_PATH = "/change-password";

/**
 * Fast page-level gate based on the signed cookie only (no DB): signed in or not, and
 * whether a temporary password must be replaced. Per-page permissions are checked by the
 * dashboard's access guard, and every API request is authorized against the DB.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN_PREFIXES.some((p) => pathname.startsWith(p)))
    return NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  let claims: SessionClaims | null = null;
  if (token) {
    try {
      claims = (
        await jwtVerify<SessionClaims>(token, jwtSecretKey(), {
          algorithms: ["HS256"],
        })
      ).payload;
    } catch {
      claims = null;
    }
  }

  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, req.url));
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!claims) {
    if (isPublic) return NextResponse.next();
    const res = redirect("/login");
    if (token) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (claims.mcp && pathname !== CHANGE_PASSWORD_PATH)
    return redirect(CHANGE_PASSWORD_PATH);
  if (isPublic) return redirect("/");
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
