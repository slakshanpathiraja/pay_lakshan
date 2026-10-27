import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { findSmtp, toPublicSmtp } from "@/server/smtp";
import { activePlatform } from "@/server/users";

/** Activates / deactivates an SMTP server; inactive servers are never used to send email. */
export const PATCH = route(
  "smtp.updateStatus",
  async ({ req, user, params, body }) => {
    const platformId = activePlatform(user);
    const { rowCount } = await query(
      "UPDATE smtp_servers SET is_active = $1, updated_at = now() WHERE id = $2 AND platform_id = $3",
      [body.isActive, params.id, platformId],
    );
    if (!rowCount) throw new ApiError(404, "NOT_FOUND");
    const server = toPublicSmtp((await findSmtp(params.id, platformId))!);
    return json({
      server,
      message: messageFor(
        req,
        body.isActive ? "notices.smtpActivated" : "notices.smtpDeactivated",
        {
          name: server.name,
        },
      ),
    });
  },
);
