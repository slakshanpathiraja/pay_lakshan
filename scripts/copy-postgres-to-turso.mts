// One-off: copies every row of the old Postgres database into the Turso database.
//
//   node_modules/.bin/jiti scripts/copy-postgres-to-turso.mts            (refuses if Turso has data)
//   node_modules/.bin/jiti scripts/copy-postgres-to-turso.mts --replace  (empties Turso first)
//
// Reads OLD_DATABASE_URL (the Postgres URL; DATABASE_URL works too) and TURSO_DATABASE_URL /
// TURSO_AUTH_TOKEN from .env.local. Creates the tables, copies the rows table by table (ids
// kept), adds the triggers last — so copied orders and devices don't queue emails or webhooks
// again — and compares the row counts. Run it again right before switching over, so orders
// made in the meantime come along (with --replace).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(root + "package.json");
const env: Record<string, string> = Object.fromEntries(
  readFileSync(root + ".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
// the shell's settings win (e.g. TURSO_DATABASE_URL=file:test.db to copy into a local file)
for (const key of ["OLD_DATABASE_URL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) if (process.env[key]) env[key] = process.env[key]!;
const pgUrl = env.OLD_DATABASE_URL || env.DATABASE_URL;
if (!pgUrl) throw new Error("Set OLD_DATABASE_URL (the Postgres URL) in .env.local");

const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, {
  alias: { "server-only": root + "scripts/server-only-stub.cjs", "@/": root + "src/" },
});
const { TABLES, INDEXES, TRIGGERS } = await jiti.import(root + "src/server/db/schema.ts");

const pg = require("pg");
const source = new pg.Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
await source.connect();
type Row = Record<string, unknown>;
const target = require("@libsql/client").createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

// parents before children (permissions' own parent_id is deferred below)
const ORDER = [
  "platforms", "roles", "users", "user_platforms",
  "permissions", "permission_urls", "actions", "permission_url_actions", "role_permission_actions",
  "app_meta", "smtp_servers", "rate_limits",
  "apps", "app_webhooks", "app_redirects",
  "app_users", "app_user_tokens", "devices", "order_templates", "orders", "order_items", "payments",
  "stripe_events", "email_outbox", "webhook_outbox",
];

const toSqlite = (v: unknown) => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v) || typeof v === "object") return JSON.stringify(v);
  return v as string | number;
};

try {
  const existing = (await target.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'platforms'")).rows.length;
  if (existing) {
    const n = Number((await target.execute("SELECT COUNT(*) AS n FROM platforms")).rows[0].n);
    if (n && !process.argv.includes("--replace")) throw new Error("Turso already has data — run with --replace to empty it first");
    if (process.argv.includes("--replace")) {
      console.log("emptying Turso…");
      const triggers = (await target.execute("SELECT name FROM sqlite_master WHERE type = 'trigger'")).rows.map((r: Row) => r.name);
      await target.batch([...triggers.map((t: unknown) => `DROP TRIGGER IF EXISTS ${t}`), ...[...ORDER].reverse().map((t: string) => `DROP TABLE IF EXISTS ${t}`)], "write");
    }
  }

  console.log("creating tables…");
  await target.batch([...TABLES, ...INDEXES], "write");

  // columns that are bigint in Postgres arrive as strings from pg
  const bigints = new Set(
    (await source.query("SELECT table_name || '.' || column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'bigint'")).rows.map((r: { c: string }) => r.c),
  );
  const pgTables = new Set((await source.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public'")).rows.map((r: { t: string }) => r.t));

  for (const table of ORDER) {
    if (!pgTables.has(table)) { console.log(`  ${table}: not in Postgres, skipped`); continue; }
    const { rows, fields } = await source.query(`SELECT * FROM ${table}`);
    if (!rows.length) { console.log(`  ${table}: 0`); continue; }
    const targetCols = new Set((await target.execute(`PRAGMA table_info(${table})`)).rows.map((r: Row) => r.name as string));
    const cols = fields.map((f: { name: string }) => f.name).filter((c: string) => targetCols.has(c));
    const dropped = fields.map((f: { name: string }) => f.name).filter((c: string) => !targetCols.has(c));
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_: string, i: number) => `?${i + 1}`).join(", ")})`;
    const statements = rows.map((row: Record<string, unknown>) => ({
      sql,
      args: cols.map((c: string) => (bigints.has(`${table}.${c}`) && row[c] !== null ? Number(row[c]) : toSqlite(row[c]))),
    }));
    for (let i = 0; i < statements.length; i += 200) {
      await target.batch(["PRAGMA defer_foreign_keys = ON", ...statements.slice(i, i + 200)], "write");
    }
    console.log(`  ${table}: ${rows.length}${dropped.length ? `  (not copied: ${dropped.join(", ")})` : ""}`);
  }

  console.log("adding triggers…");
  await target.batch(TRIGGERS, "write");

  console.log("checking…");
  let mismatch = 0;
  for (const table of ORDER) {
    if (!pgTables.has(table)) continue;
    const a = Number((await source.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
    const b = Number((await target.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
    if (a !== b) { mismatch++; console.log(`  MISMATCH ${table}: postgres ${a}, turso ${b}`); }
  }
  const fk = (await target.execute("PRAGMA foreign_key_check")).rows.length;
  console.log(mismatch || fk ? `done with problems: ${mismatch} count mismatches, ${fk} foreign key problems` : "done — every table matches");
} finally {
  await source.end();
  target.close();
}
