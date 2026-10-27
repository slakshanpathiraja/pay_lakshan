import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ensureDb } from "./db/init";
import { errorMessage } from "./messages";
import { ApiError } from "./errors";
import { clearSession, getSessionUser } from "./session";
import { platformProblem, type UserRow } from "./users";

export { ApiError, type ErrorCode } from "./errors";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Wraps every route handler: ensures the DB is ready and turns any error into the one
 * error format — `{ error: CODE, message: "…in the user's language…", details? }` —
 * which the UI's error middleware shows as an alert.
 */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      await ensureDb();
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        // A revoked token still has a valid signature, so the page proxy would keep treating
        // it as logged in and bounce /login <-> app forever. Drop the cookie on 401.
        // Same for an account whose platforms are gone or inactive: sign it out.
        if (
          err.status === 401 ||
          err.code === "PLATFORM_INACTIVE" ||
          err.code === "NO_PLATFORM"
        ) {
          await clearSession();
        }
        return json(
          {
            error: err.code,
            message: errorMessage(err.code, req),
            details: err.details,
          },
          err.status,
        );
      }
      console.error("[api]", err);
      return json(
        {
          error: "INTERNAL_ERROR",
          message: errorMessage("INTERNAL_ERROR", req),
        },
        500,
      );
    }
  };
}

export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<T> {
  const body = await req.json().catch(() => null);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  }
  return result.data;
}

interface AuthOptions {
  /** allow users who still have a temporary password (only change-password / me / logout) */
  allowPendingPasswordChange?: boolean;
}

export async function requireUser(opts: AuthOptions = {}): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "UNAUTHENTICATED");
  // no usable platform: all of theirs were deactivated (or removed) since they signed in
  if (!user.role_id) throw new ApiError(403, await platformProblem(user.id));
  if (user.must_change_password && !opts.allowPendingPasswordChange) {
    throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED");
  }
  return user;
}
