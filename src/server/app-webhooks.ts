import "server-only";
import { createHmac } from "node:crypto";
import { currencyDigits } from "@/lib/commerce";
import { ORDER_STATE } from "./commerce";
import { decryptSecret } from "./crypto";
import { query } from "./db/pool";

// Outgoing app webhooks: each order change queued in webhook_outbox (by a DB trigger) is
// POSTed as JSON to the app's webhook URLs. Signed with the app secret so the app can check it
// came from here:
//
//   X-Pay-Signature: hex HMAC-SHA256(appSecret, `${X-Pay-Timestamp}.${raw body}`)

const MAX_ATTEMPTS = 8;
const TIMEOUT_MS = 10_000;

interface OutboxRow {
  id: string;
  app_id: number;
  url: string;
  event: string;
  order_id: number;
  data: { oldPayment?: string; oldStatus?: string };
  attempts: number;
  created_at: Date;
}

export type AppWebhookPayload = ReturnType<typeof payload>;

function payload(row: OutboxRow, o: OrderSnapshot) {
  return {
    id: `evt_${row.id}`,
    type: row.event,
    createdAt: row.created_at.toISOString(),
    data: {
      order: {
        orderId: o.order_number,
        status: o.status,
        paymentStatus: o.payment_status,
        billing: o.billing,
        currency: o.currency,
        amount: (o.amount / 10 ** currencyDigits(o.currency)).toFixed(currencyDigits(o.currency)),
        template: o.template_code,
        startsAt: o.starts_at?.toISOString() ?? null,
        expiresAt: o.ends_at?.toISOString() ?? null,
        user: { id: o.app_user_id, email: o.email },
      },
      previous:
        row.event === "order.updated" ? { status: row.data.oldStatus ?? null, paymentStatus: row.data.oldPayment ?? null } : null,
    },
  };
}

interface OrderSnapshot {
  order_number: string;
  status: string;
  payment_status: string;
  billing: string;
  currency: string;
  /** minor units */
  amount: number;
  template_code: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  app_user_id: number;
  email: string | null;
  app_secret: string;
}

/** The order as it is now (statuses, dates, total in the currency's units) and its app's secret. */
async function snapshot(orderId: number) {
  const { rows } = await query<OrderSnapshot>(
    `SELECT o.order_number, ${ORDER_STATE} AS status, o.payment_status, o.billing, o.currency,
            COALESCE((SELECT SUM(i.quantity * i.unit_amount) FROM order_items i WHERE i.order_id = o.id), 0)::float8 AS amount,
            t.code AS template_code, o.starts_at, o.ends_at, o.app_user_id, u.email, a.app_secret
       FROM orders o
       JOIN apps a ON a.id = o.app_id
       LEFT JOIN app_users u ON u.id = o.app_user_id
       LEFT JOIN order_templates t ON t.id = o.template_id
      WHERE o.id = $1`,
    [orderId],
  );
  return rows[0];
}

export function signWebhook(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

async function deliver(row: OutboxRow, o: OrderSnapshot) {
  const body = JSON.stringify(payload(row, o));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await fetch(row.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "pay-webhooks/1",
      "X-Pay-Event": row.event,
      "X-Pay-Delivery": `evt_${row.id}`,
      "X-Pay-Timestamp": timestamp,
      "X-Pay-Signature": signWebhook(decryptSecret(o.app_secret), timestamp, body),
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await res.body?.cancel().catch(() => {});
  return res.status;
}

/**
 * Sends the deliveries that are due (oldest first). Anything but a 2xx answer is retried
 * later (2, 4, 8 … minutes) and given up after 8 tries. Several callers at once each take
 * different rows.
 */
export async function processWebhookOutbox(limit = 20) {
  const counts = { sent: 0, failed: 0, retry: 0 };
  // claimed rows are hidden for 10 minutes, so a crash mid-send is retried after that
  const { rows } = await query<OutboxRow>(
    `UPDATE webhook_outbox SET status = 'sending', attempts = attempts + 1,
            next_attempt_at = now() + interval '10 minutes'
      WHERE id IN (SELECT id FROM webhook_outbox
                    WHERE status IN ('pending', 'sending') AND next_attempt_at <= now()
                    ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id, app_id, url, event, order_id, data, attempts, created_at`,
    [limit],
  );
  for (const row of rows) {
    let status: number | null = null;
    try {
      const order = await snapshot(row.order_id);
      if (!order) throw new Error("order not found");
      status = await deliver(row, order);
      if (status < 200 || status >= 300) throw new Error(`answered HTTP ${status}`);
      await query(
        "UPDATE webhook_outbox SET status = 'sent', sent_at = now(), response_status = $2, last_error = NULL WHERE id = $1",
        [row.id, status],
      );
      counts.sent++;
    } catch (err) {
      const error = ((err as Error).name === "TimeoutError" ? "no answer in 10 s" : (err as Error).message).slice(0, 500);
      const giveUp = row.attempts >= MAX_ATTEMPTS;
      await query(
        `UPDATE webhook_outbox SET status = $2::varchar, last_error = $3, response_status = $4,
                next_attempt_at = CASE WHEN $2::varchar = 'pending' THEN now() + make_interval(mins => $5) ELSE next_attempt_at END
          WHERE id = $1`,
        [row.id, giveUp ? "failed" : "pending", error, status, 2 ** row.attempts],
      );
      if (giveUp) counts.failed++;
      else counts.retry++;
    }
  }
  return counts;
}
