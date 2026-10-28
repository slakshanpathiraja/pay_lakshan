import { route } from "@/server/api/route";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { assertManagesWholeAccount, assertNotSelf, findPublicUser } from "@/server/users";

/** Enables or disables the account (on every platform); disabling signs it out. */
export const PATCH = route(
  "managers.updateStatus",
  async ({ req, user, params, body }) => {
    assertNotSelf(user, params.id);
    await assertManagesWholeAccount(user, params.id);
    await query(
      `UPDATE users SET is_active = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2`,
      [body.isActive, params.id],
    );
    const target = (await findPublicUser(params.id, user.platform_id))!;
    return json({
      user: target,
      message: messageFor(
        req,
        body.isActive
          ? "notices.managerActivated"
          : "notices.managerDeactivated",
        {
          name: target.username,
        },
      ),
    });
  },
);
