import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ACTIONS, PERMISSION_KEY_RE } from "@/lib/access";
import { getConfig } from "../config";
import { createPlatform } from "../platforms";
import { setPermissionUrls, setRoleGrants, syncSuperAdminGrants, validateUrls } from "../rbac";
import { permissionUrlSchema } from "../schemas";
import seedFile from "../seed/permissions.json";
import { batch, query, withTransaction } from "./pool";
import { INDEXES, TABLES, TRIGGERS, ADDED_COLUMNS } from "./schema";

/** Tables, indexes and triggers (all "IF NOT EXISTS"), and the four actions. */
async function migrate() {
  await batch([...TABLES, ...INDEXES, ...TRIGGERS]);
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const { rows } = await query("SELECT 1 FROM pragma_table_info($1) WHERE name = $2", [table, column]);
    if (!rows.length) await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  for (const action of ACTIONS) await query("INSERT OR IGNORE INTO actions (key) VALUES ($1)", [action]);
}

const FIRST_RUN_SEEDED = "seed.permissions";

/** The global Super Admin role exists, and holds every action of every card. */
async function seedSuperAdminRole() {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO roles (platform_id, key, name, is_system)
       SELECT NULL, 'super_admin', 'Super Admin', 1
        WHERE NOT EXISTS (SELECT 1 FROM roles WHERE key = 'super_admin' AND platform_id IS NULL)`,
    );
    await syncSuperAdminGrants(client);
  });
}

/** Creates the default super admin when the users table is empty. */
async function seedDefaultAdmin() {
  const config = getConfig();
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ count: number }>("SELECT COUNT(*) AS count FROM users");
    if (Number(rows[0].count) > 0) return;
    // a live server must not come up with the well-known admin / admin: whoever signs in first
    // would own it
    const password = process.env.DEFAULT_ADMIN_PASSWORD;
    if (config.NODE_ENV === "production" && (!password || password === "admin" || password.length < 12)) {
      console.error("[seed] set DEFAULT_ADMIN_PASSWORD (12+ characters) to create the first super admin");
      return;
    }

    const hash = await bcrypt.hash(config.DEFAULT_ADMIN_PASSWORD, 12);
    await client.query(
      `INSERT INTO users (username, password_hash, role_id, must_change_password)
       VALUES ($1, $2, (SELECT id FROM roles WHERE key = 'super_admin' AND platform_id IS NULL), 1)`,
      [config.DEFAULT_ADMIN_USERNAME.toLowerCase(), hash],
    );
    console.log(
      `[seed] users table was empty — created super admin "${config.DEFAULT_ADMIN_USERNAME}" (password change required on first login)`,
    );
  });
}

const actionList = z.array(z.enum(ACTIONS)).min(1);
const seedSchema = z.object({
  permissions: z.array(
    z.object({
      key: z.string().regex(PERMISSION_KEY_RE),
      name: z.string().trim().min(1).max(80),
      parent: z.string().optional(),
      urls: z.array(permissionUrlSchema),
    }),
  ),
  newPlatform: z.object({ managerGrants: z.record(z.string(), actionList) }),
  platforms: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        roles: z.array(
          z.object({
            name: z.string().trim().min(1).max(50),
            grants: z.record(z.string(), actionList),
          }),
        ),
        members: z.array(z.object({ username: z.string(), role: z.string() })),
      }),
    )
    .default([]),
  users: z
    .array(
      z.object({
        username: z.string().regex(/^[a-z0-9._-]{3,50}$/),
        fullName: z.string().optional(),
      }),
    )
    .default([]),
});

/**
 * First run only (recorded in app_meta, so anything deleted later stays deleted): creates
 * the permission cards, demo accounts and demo platforms — each with its Manager role,
 * extra roles and members — from seed/permissions.json.
 */
async function seedFirstRun() {
  const seed = seedSchema.parse(seedFile);
  await withTransaction(async (client) => {
    const { rowCount: done } = await client.query("SELECT 1 FROM app_meta WHERE key = $1", [FIRST_RUN_SEEDED]);
    if (done) return;

    // Permission cards (by key), then their parents.
    const cardIds = new Map<string, number>();
    for (const card of seed.permissions) {
      const { rows } = await client.query<{ id: number }>(
        "INSERT INTO permissions (key, name) VALUES ($1, $2) RETURNING id",
        [card.key, card.name],
      );
      await setPermissionUrls(client, rows[0].id, validateUrls(card.urls));
      cardIds.set(card.key, rows[0].id);
    }
    for (const card of seed.permissions) {
      if (!card.parent) continue;
      const parentId = cardIds.get(card.parent);
      if (!parentId) throw new Error(`seed: unknown parent card "${card.parent}"`);
      await client.query("UPDATE permissions SET parent_id = $1 WHERE id = $2", [parentId, cardIds.get(card.key)]);
    }
    const grantsFor = (grants: Record<string, z.infer<typeof actionList>>) =>
      Object.entries(grants).map(([key, actions]) => {
        const permissionId = cardIds.get(key);
        if (!permissionId) throw new Error(`seed: grant for unknown card "${key}"`);
        return { permissionId, actions };
      });

    // Demo accounts (temporary password, changed on first sign in).
    const hash = await bcrypt.hash(getConfig().DEMO_USER_PASSWORD, 12);
    const userIds = new Map<string, number>();
    for (const u of seed.users) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (username, full_name, password_hash, must_change_password)
         VALUES ($1, $2, $3, 1) ON CONFLICT (username) DO NOTHING RETURNING id`,
        [u.username, u.fullName ?? null, hash],
      );
      if (rows[0]) userIds.set(u.username, rows[0].id);
    }

    // Demo platforms: Manager role (via createPlatform), extra roles, members.
    for (const platform of seed.platforms) {
      const { platformId } = await createPlatform(client, platform.name);
      const roleIds = new Map<string, number>();
      const { rows: manager } = await client.query<{ id: number }>(
        "SELECT id FROM roles WHERE platform_id = $1 AND key = 'manager'",
        [platformId],
      );
      roleIds.set("Manager", manager[0].id);
      for (const role of platform.roles) {
        const { rows } = await client.query<{ id: number }>(
          "INSERT INTO roles (platform_id, name) VALUES ($1, $2) RETURNING id",
          [platformId, role.name],
        );
        await setRoleGrants(client, rows[0].id, grantsFor(role.grants));
        roleIds.set(role.name, rows[0].id);
      }
      for (const m of platform.members) {
        const userId = userIds.get(m.username);
        const roleId = roleIds.get(m.role);
        if (!userId) continue; // account already existed before the seed
        if (!roleId) throw new Error(`seed: platform "${platform.name}" has no role "${m.role}"`);
        await client.query("INSERT INTO user_platforms (user_id, platform_id, role_id) VALUES ($1, $2, $3)", [
          userId,
          platformId,
          roleId,
        ]);
      }
    }

    await syncSuperAdminGrants(client);
    await client.query("INSERT INTO app_meta (key, value) VALUES ($1, now())", [FIRST_RUN_SEEDED]);
    console.log("[seed] created permission cards, demo platforms, roles and accounts from seed/permissions.json");
  });
}

// Bump when the schema or a seed changes: servers then run setup once more (a hot-reloaded dev
// server too) — otherwise it's skipped because the database says it's done.
const SCHEMA_VERSION = 50;

const globalForInit = globalThis as unknown as {
  dbReady?: Promise<void>;
  dbVersion?: number;
};

/** Whether the database was already set up by this SCHEMA_VERSION (false when it's new). */
async function schemaIsCurrent() {
  try {
    const { rows } = await query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'schema-version'");
    return rows[0]?.value === String(SCHEMA_VERSION);
  } catch {
    return false; // no app_meta yet: a new database
  }
}

/** Records that the database has this SCHEMA_VERSION's schema (also used by the data copy). */
export async function markSchemaCurrent() {
  await query(
    `INSERT INTO app_meta (key, value) VALUES ('schema-version', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [String(SCHEMA_VERSION)],
  );
}

/**
 * Old rows nobody needs (expired refresh tokens and rate-limit counters, delivered emails and
 * webhooks after a month, handled Stripe event ids after 90 days). Run by the health cron.
 */
export async function cleanUpOldRows() {
  const [, tokens, emails, webhooks] = await Promise.all([
    query(`DELETE FROM rate_limits WHERE reset_at < now('-1 days')`),
    query(`DELETE FROM app_user_tokens WHERE expires_at < now('-7 days')`),
    query(`DELETE FROM email_outbox WHERE status IN ('sent', 'skipped') AND created_at < now('-30 days')`),
    query(`DELETE FROM webhook_outbox WHERE status = 'sent' AND created_at < now('-30 days')`),
    // handled Stripe event ids only matter while Stripe may still resend them (3 days)
    query(`DELETE FROM stripe_events WHERE received_at < now('-90 days')`),
  ]);
  return { tokens: tokens.rowCount, emails: emails.rowCount, webhooks: webhooks.rowCount };
}

/** Runs schema setup + seed once per process; every API handler awaits this. */
export function ensureDb() {
  if (globalForInit.dbVersion !== SCHEMA_VERSION) globalForInit.dbReady = undefined;
  globalForInit.dbVersion = SCHEMA_VERSION;
  globalForInit.dbReady ??= (async () => {
    // Serverless platforms start new instances often: when the database already has this
    // schema, one query is all a cold start costs
    if (await schemaIsCurrent()) return;
    await migrate();
    await seedSuperAdminRole(); // the role first, then the super admin account that uses it
    await seedDefaultAdmin();
    await seedFirstRun();
    await seedSuperAdminRole(); // Super Admin also gets the cards created by the seed
    await markSchemaCurrent();
  })().catch((err) => {
    globalForInit.dbReady = undefined; // retry on the next request
    throw err;
  });
  return globalForInit.dbReady;
}
