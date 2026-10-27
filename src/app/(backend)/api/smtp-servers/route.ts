import { route } from "@/server/api/route";
import { encryptSecret } from "@/server/crypto";
import { query, withTransaction } from "@/server/db/pool";
import { json } from "@/server/http";
import { activePlatform } from "@/server/users";
import {
  clearOtherDefaults,
  findSmtp,
  toPublicSmtp,
  type SmtpServerRow,
} from "@/server/smtp";

/** The active platform's SMTP servers. */
export const GET = route("smtp.list", async ({ user }) => {
  const { rows } = await query<SmtpServerRow>(
    "SELECT * FROM smtp_servers WHERE platform_id = $1 ORDER BY is_default DESC, LOWER(name)",
    [activePlatform(user)],
  );
  return json({ servers: rows.map(toPublicSmtp) });
});

/** Adds an SMTP server to the active platform. */
export const POST = route("smtp.create", async ({ user, body }) => {
  const platformId = activePlatform(user);
  const id = await withTransaction(async (client) => {
    if (body.isDefault) await clearOtherDefaults(client, platformId, null);
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO smtp_servers
         (platform_id, name, host, port, secure, username, password_enc, from_email, from_name, is_default, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        platformId,
        body.name,
        body.host,
        body.port,
        body.secure,
        body.username,
        body.password ? encryptSecret(body.password) : null,
        body.fromEmail,
        body.fromName,
        body.isDefault,
        body.isActive,
      ],
    );
    return rows[0].id;
  });
  return json({ server: toPublicSmtp((await findSmtp(id, platformId))!) }, 201);
});
