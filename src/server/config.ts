import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  /** Turso database: libsql://<db>-<org>.turso.io (or file:local.db for a local SQLite file) */
  TURSO_DATABASE_URL: z.string().min(1, "TURSO_DATABASE_URL is required"),
  /** Turso auth token (not needed for a local file) */
  TURSO_AUTH_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  /** Public base URL/host of the app (e.g. https://pay4.lakshan.dev) used for Stripe redirects and checkout */
  APP_URL: z.string().trim().optional(),
  HOST: z.string().trim().optional(),
  /** encrypts stored secrets (SMTP passwords); falls back to a key derived from JWT_SECRET */
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(8),
  DEFAULT_ADMIN_USERNAME: z.string().default("admin"),
  DEFAULT_ADMIN_PASSWORD: z.string().default("admin"),
  /** temporary password of the demo accounts created by the first-run seed */
  DEMO_USER_PASSWORD: z.string().min(1).default("Demo@1234"),
  /** Stripe (one account for every platform); without it orders get no payment links */
  STRIPE_SECRET_KEY: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(
      z
        .string()
        .regex(
          /^(sk|rk)_(test|live)_\w+$/,
          "STRIPE_SECRET_KEY must be sk_… or rk_…",
        )
        .optional(),
    ),
  /** signing secret of the webhook endpoint /api/stripe/webhook (whsec_…) */
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(
      z
        .string()
        .startsWith("whsec_", "STRIPE_WEBHOOK_SECRET must be whsec_…")
        .optional(),
    ),
  /** Google Play: the service account key JSON (as is or base64); without it no Play purchases */
  GOOGLE_PLAY_SERVICE_ACCOUNT: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  /** Google Play notifications: the audience set on the Pub/Sub push subscription */
  GOOGLE_PLAY_PUSH_AUDIENCE: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  /** …and the service account Pub/Sub signs pushes as (optional, recommended) */
  GOOGLE_PLAY_PUSH_EMAIL: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

let cached: z.infer<typeof schema> | null = null;

// Parsed lazily so `next build` doesn't need real DB credentials.
export function getConfig() {
  if (cached) return cached;
  // an empty setting (`NAME=` in .env) counts as not set: its default applies
  const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // names and reasons only, never the values (they are secrets)
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid server environment — ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Resolves the public base URL (origin) of the portal.
 * Prioritizes APP_URL or HOST from config/.env, then falls back to request headers
 * (x-forwarded-host / x-forwarded-proto), then req.url origin, and finally localhost:3000.
 */
export function getAppOrigin(req?: Request): string {
  const cfg = getConfig();
  const configured = cfg.APP_URL || cfg.HOST;
  if (configured) {
    const trimmed = configured.trim().replace(/\/+$/, "");
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
  if (req) {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
    if (forwardedHost) {
      return `${forwardedProto}://${forwardedHost.split(",")[0].trim()}`;
    }
    try {
      return new URL(req.url).origin;
    } catch {
      // invalid URL
    }
  }
  return "http://localhost:3000";
}
