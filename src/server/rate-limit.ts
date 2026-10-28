import "server-only";
import { query } from "./db/pool";

/**
 * Fixed-window limiter kept in the database, so it holds across serverless instances (an
 * in-memory one starts empty on every new instance). True when `key` went over `limit`
 * in the current window.
 */
export async function hitRateLimit(key: string, limit: number, windowMs: number) {
  const { rows } = await query<{ count: number }>(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, now('+' || $2 || ' seconds'))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
     RETURNING count`,
    [key.slice(0, 200), windowMs / 1000],
  );
  return rows[0].count > limit;
}

/** The caller's IP: set by the platform (Vercel's x-real-ip / first x-forwarded-for hop). */
export function clientIp(req: Request) {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
