import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { expireOverdueOrders } from "@/server/commerce";
import { cleanUpOldRows } from "@/server/db/init";
import { processWebhookOutbox } from "@/server/app-webhooks";
import { processEmailOutbox } from "@/server/email/outbox";

/**
 * Database check — and, meant to be called by a cron job, it stores "expired" on active
 * orders whose period has ended (e.g. a subscription whose renewal payment failed). Paying
 * later makes it active again with new dates (Stripe webhook / Change status). It also sends
 * queued emails and app webhook deliveries (including retries) and deletes rows that are too
 * old to matter (expired refresh tokens, month-old delivered emails and webhooks).
 */
export const GET = route("system.health", async () => {
  try {
    await query("SELECT 1");
  } catch {
    return json({ ok: false, db: "down" }, 503);
  }
  const expiredOrders = await expireOverdueOrders();
  const emails = await processEmailOutbox(100);
  const webhooks = await processWebhookOutbox(100);
  const cleanedUp = await cleanUpOldRows();
  return json({ ok: true, db: "up", expiredOrders, emails, webhooks, cleanedUp, checkedAt: new Date().toISOString() });
});
