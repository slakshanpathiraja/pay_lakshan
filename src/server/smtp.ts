import "server-only";
import nodemailer from "nodemailer";
import { decryptSecret } from "./crypto";
import { query, type DbClient } from "./db/pool";

export interface SmtpServerRow {
  id: number;
  /** SMTP servers belong to a platform */
  platform_id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password_enc: string | null;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Where customer replies and question emails go. Uses `reply_to` when set;
 * if sending from a `no-reply@...` address, automatically directs replies to `info@...`.
 */
export function replyToFor(server: {
  reply_to?: string | null;
  from_email: string;
}): string | undefined {
  if (server.reply_to?.trim()) return server.reply_to.trim();
  if (/^no-?reply@/i.test(server.from_email)) {
    return server.from_email.replace(/^no-?reply@/i, "info@");
  }
  return undefined;
}

/** Never send the password (encrypted or not) to the client. */
export function toPublicSmtp({ password_enc, ...rest }: SmtpServerRow) {
  return { ...rest, has_password: !!password_enc };
}

/** A server of `platformId` (servers of other platforms are not found). */
export async function findSmtp(id: number, platformId: string) {
  const { rows } = await query<SmtpServerRow>(
    "SELECT * FROM smtp_servers WHERE id = $1 AND platform_id = $2",
    [id, platformId],
  );
  return rows[0] ?? null;
}

/** One default server per platform: clear the flag on the platform's other servers first. */
export async function clearOtherDefaults(
  client: DbClient,
  platformId: string,
  exceptId: number | null,
) {
  await client.query(
    `UPDATE smtp_servers SET is_default = FALSE
      WHERE is_default AND platform_id = $1 AND ($2 IS NULL OR id <> $2)`,
    [platformId, exceptId],
  );
}

export function transportFor(server: SmtpServerRow) {
  return nodemailer.createTransport({
    host: server.host,
    port: server.port,
    secure: server.secure,
    auth: server.username
      ? {
          user: server.username,
          pass: server.password_enc ? decryptSecret(server.password_enc) : "",
        }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}
