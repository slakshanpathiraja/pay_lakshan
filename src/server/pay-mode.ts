import "server-only";
import { cached } from "./cache";
import { getConfig } from "./config";
import { query } from "./db/pool";

// Which payment accounts a platform uses. A platform marked "test" (Platforms page) uses the
// *_TEST settings, every other platform the plain ones ("live" here, even if they hold Stripe
// test keys on a dev server). Payments of one mode never touch the other mode's platforms:
// the webhooks check it (stripe-webhook.ts, google-play-sync.ts).

export type PayMode = "live" | "test";
export const PAY_MODES: PayMode[] = ["live", "test"];

/** The platform's mode (cached a minute; dropped as soon as anything changes). */
export async function platformMode(platformId: string): Promise<PayMode> {
  return cached(`pay-mode:${platformId}`, 60_000, "data", async () => {
    const { rows } = await query<{ is_test: boolean }>("SELECT is_test FROM platforms WHERE id = $1", [platformId]);
    return rows[0]?.is_test ? "test" : "live";
  });
}

/** SQL: the platforms of `mode` (for `platform_id IN (…)`), with its flag as parameter `$n`. */
export const platformsOfMode = (param: string) => `SELECT id FROM platforms WHERE is_test = ${param}`;

export function stripeSettings(mode: PayMode) {
  const c = getConfig();
  return mode === "test"
    ? { secretKey: c.STRIPE_SECRET_KEY_TEST, webhookSecret: c.STRIPE_WEBHOOK_SECRET_TEST }
    : { secretKey: c.STRIPE_SECRET_KEY, webhookSecret: c.STRIPE_WEBHOOK_SECRET };
}

export function playSettings(mode: PayMode) {
  const c = getConfig();
  return mode === "test"
    ? {
        serviceAccount: c.GOOGLE_PLAY_SERVICE_ACCOUNT_TEST,
        pushAudience: c.GOOGLE_PLAY_PUSH_AUDIENCE_TEST,
        pushEmail: c.GOOGLE_PLAY_PUSH_EMAIL_TEST,
      }
    : {
        serviceAccount: c.GOOGLE_PLAY_SERVICE_ACCOUNT,
        pushAudience: c.GOOGLE_PLAY_PUSH_AUDIENCE,
        pushEmail: c.GOOGLE_PLAY_PUSH_EMAIL,
      };
}
