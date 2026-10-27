import "server-only";
import { randomInt } from "node:crypto";
import { query } from "../db/pool";
import { transportFor, type SmtpServerRow } from "../smtp";

// Emails to an app's users go out through their platform's own SMTP servers (SMTP page).

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResult =
  | { sent: true; serverId: number }
  | { sent: false; reason: string; /** the platform has no active SMTP server */ noServer?: true };

function shuffle<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sends through one of the platform's active SMTP servers, picked at random so the load is
 * spread across them. If that server fails, the others are tried in turn.
 */
export async function sendPlatformEmail(platformId: string, message: EmailMessage): Promise<SendResult> {
  const { rows } = await query<SmtpServerRow>(
    "SELECT * FROM smtp_servers WHERE platform_id = $1 AND is_active",
    [platformId],
  );
  if (!rows.length) return { sent: false, reason: "no active SMTP server", noServer: true };
  let lastError = "";
  for (const server of shuffle(rows)) {
    const transport = transportFor(server);
    try {
      await transport.sendMail({
        from: server.from_name ? { name: server.from_name, address: server.from_email } : server.from_email,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { sent: true, serverId: server.id };
    } catch (err) {
      lastError = (err as Error).message;
      console.warn(`[email] SMTP server "${server.name}" (${server.id}) failed: ${lastError}`);
    } finally {
      transport.close();
    }
  }
  return { sent: false, reason: lastError };
}
