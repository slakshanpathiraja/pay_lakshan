import { route } from "@/server/api/route";
import { encryptSecret } from "@/server/crypto";
import { query, withTransaction } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { activePlatform } from "@/server/users";
import { clearOtherDefaults, findSmtp, toPublicSmtp } from "@/server/smtp";

export const PUT = route("smtp.update", async ({ user, params, body }) => {
  const platformId = activePlatform(user);
  const existing = await findSmtp(params.id, platformId);
  if (!existing) throw new ApiError(404, "NOT_FOUND");

  // undefined = keep the stored password, "" = remove it, anything else = replace it
  const passwordEnc =
    body.password === undefined
      ? existing.password_enc
      : body.password
        ? encryptSecret(body.password)
        : null;

  await withTransaction(async (client) => {
    if (body.isDefault) await clearOtherDefaults(client, platformId, params.id);
    await client.query(
      `UPDATE smtp_servers
          SET name = $1, host = $2, port = $3, secure = $4, username = $5, password_enc = $6,
              from_email = $7, from_name = $8, is_default = $9, is_active = $10, updated_at = now()
        WHERE id = $11`,
      [
        body.name,
        body.host,
        body.port,
        body.secure,
        body.username,
        passwordEnc,
        body.fromEmail,
        body.fromName,
        body.isDefault,
        body.isActive,
        params.id,
      ],
    );
  });
  return json({
    server: toPublicSmtp((await findSmtp(params.id, platformId))!),
  });
});

export const DELETE = route("smtp.delete", async ({ user, params }) => {
  const { rowCount } = await query(
    "DELETE FROM smtp_servers WHERE id = $1 AND platform_id = $2",
    [params.id, activePlatform(user)],
  );
  if (!rowCount) throw new ApiError(404, "NOT_FOUND");
  return new Response(null, { status: 204 });
});
