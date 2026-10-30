import { invalidateAccessCache } from "@/server/access";
import { route } from "@/server/api/route";
import { query, withTransaction } from "@/server/db/pool";
import { json } from "@/server/http";
import {
  createPlatform,
  createPlatformManager,
  PLATFORM_SELECT,
  type PlatformRow,
} from "@/server/platforms";
import { isSuperAdmin } from "@/server/users";

/** Super admin: every platform. Others: only the platforms they belong to. */
export const GET = route("platforms.list", async ({ user }) => {
  const { rows } = isSuperAdmin(user)
    ? await query<PlatformRow>(
        `SELECT ${PLATFORM_SELECT} ORDER BY LOWER(p.name)`,
      )
    : await query<PlatformRow>(
        `SELECT ${PLATFORM_SELECT}
          WHERE p.id IN (SELECT platform_id FROM user_platforms WHERE user_id = $1)
          ORDER BY LOWER(p.name)`,
        [user.id],
      );
  return json({ platforms: rows });
});

/**
 * Creates the platform (id generated), its Manager role and its first account
 * (`manager.<name>`, Manager role, random temporary password returned once).
 */
export const POST = route("platforms.create", async ({ user, body }) => {
  const { id, account } = await withTransaction(async (client) => {
    const { platformId, managerRoleId } = await createPlatform(
      client,
      body.name,
      body.isTest ?? false,
    );
    const account = await createPlatformManager(client, {
      id: platformId,
      name: body.name,
      managerRoleId,
    });
    // a non super admin creator joins the new platform as its Manager, so they can still reach it
    if (!isSuperAdmin(user)) {
      await client.query(
        "INSERT INTO user_platforms (user_id, platform_id, role_id) VALUES ($1, $2, $3)",
        [user.id, platformId, managerRoleId],
      );
    }
    return { id: platformId, account };
  });
  invalidateAccessCache();
  const { rows } = await query<PlatformRow>(
    `SELECT ${PLATFORM_SELECT} WHERE p.id = $1`,
    [id],
  );
  return json({ platform: rows[0], account }, 201);
});
