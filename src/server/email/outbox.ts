import "server-only";
import { query, type DbClient } from "../db/pool";
import { emailValues, type OutboxRow } from "./messages";
import { renderEmail, type EmailTemplate } from "./render";
import { sendPlatformEmail } from "./send";

// The email queue (email_outbox). Rows are added with the change they're about (same
// transaction), by code or by the order / device triggers, and sent by processEmailOutbox:
// after every request that changes something, and by the health check's cron job.

const MAX_ATTEMPTS = 5;

/**
 * Queue an email. Inside a transaction pass its client, so the email is only sent if the
 * change is saved.
 */
export async function enqueueEmail(
  email: { platformId: string; template: EmailTemplate; to: string | null; data: Record<string, unknown> },
  client?: DbClient,
) {
  if (!email.to) return; // users with only a phone number get no email
  const run = client ? client.query.bind(client) : query;
  await run("INSERT INTO email_outbox (platform_id, template, to_email, data) VALUES ($1, $2, $3, $4)", [
    email.platformId,
    email.template,
    email.to,
    email.data,
  ]);
}

/** Reserved names (RFC 2606 / 6761) never reach anyone: example.com, *.test, *.invalid… */
function undeliverable(address: string) {
  const domain = address.split("@").pop()?.toLowerCase() ?? "";
  return (
    /\.(test|example|invalid|localhost)$/.test(domain) ||
    ["example.com", "example.net", "example.org"].includes(domain)
  );
}

async function finish(id: number, status: "sent" | "failed" | "skipped", extra: { error?: string; serverId?: number }) {
  await query(
    `UPDATE email_outbox SET status = $2, last_error = $3, smtp_server_id = $4,
            sent_at = CASE WHEN $2 = 'sent' THEN now() END
      WHERE id = $1`,
    [id, status, extra.error?.slice(0, 500) ?? null, extra.serverId ?? null],
  );
}

/**
 * Sends the emails that are due (oldest first). A failed send is retried later (2, 4, 8, 16
 * minutes) and given up after 5 tries; a platform without an active SMTP server skips it.
 * Several callers at once each take different rows.
 */
export async function processEmailOutbox(limit = 20) {
  const counts = { sent: 0, failed: 0, retry: 0, skipped: 0 };
  // claimed rows are hidden for 10 minutes, so a crash mid-send is retried after that
  const { rows } = await query<OutboxRow>(
    `UPDATE email_outbox SET status = 'sending', attempts = attempts + 1,
            next_attempt_at = now('+10 minutes')
      WHERE id IN (SELECT id FROM email_outbox
                    WHERE status IN ('pending', 'sending') AND next_attempt_at <= now()
                    ORDER BY id LIMIT $1)
      RETURNING id, platform_id, template, to_email, data, attempts, created_at`,
    [limit],
  );
  for (const row of rows) {
    try {
      if (undeliverable(row.to_email)) {
        await finish(row.id, "skipped", { error: "reserved test domain" });
        counts.skipped++;
        continue;
      }
      const values = await emailValues(row);
      if (!values) {
        await finish(row.id, "skipped", { error: "nothing to tell any more" });
        counts.skipped++;
        continue;
      }
      const result = await sendPlatformEmail(row.platform_id, { to: row.to_email, ...renderEmail(row.template, values) });
      if (result.sent) {
        // already delivered: if recording it fails, log it rather than send it again
        await finish(row.id, "sent", { serverId: result.serverId }).catch((err) =>
          console.error(`[email] outbox ${row.id} sent but not marked:`, err),
        );
        counts.sent++;
      } else if (result.noServer) {
        await finish(row.id, "skipped", { error: result.reason });
        counts.skipped++;
      } else {
        throw new Error(result.reason);
      }
    } catch (err) {
      const error = (err as Error).message;
      if (row.attempts >= MAX_ATTEMPTS) {
        await finish(row.id, "failed", { error });
        counts.failed++;
      } else {
        await query(
          `UPDATE email_outbox SET status = 'pending', last_error = $2,
                  next_attempt_at = now('+' || $3 || ' minutes')
            WHERE id = $1`,
          [row.id, error.slice(0, 500), 2 ** row.attempts],
        );
        counts.retry++;
      }
    }
  }
  return counts;
}
