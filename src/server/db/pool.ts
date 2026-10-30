import "server-only";
import { createClient, type Client, type InArgs, type ResultSet, type Transaction } from "@libsql/client";
import { getConfig } from "../config";

// The database is Turso (libSQL, i.e. SQLite) over the network. One client per process —
// HTTP based, so there are no pooled connections to run out of.
//
// SQL is SQLite's, with two shorthands this module expands:
//   $1, $2 …        numbered parameters (→ ?1, ?2 …)
//   now()           the current time as ISO-8601 UTC text, e.g. 2026-10-28T05:54:25.282Z;
//   now('-7 days')  …moved by SQLite date modifiers ('+1 months', '-30 minutes' …)
// Timestamps are stored as that text, so they compare and sort correctly.
//
// Values are converted both ways so callers get JS types: Date params are
// stored as ISO text, booleans as 0/1, arrays / objects as JSON; read back, columns ending in
// `_at` / `At` become Dates, boolean columns booleans, JSON columns parsed values.

const globalForDb = globalThis as unknown as { libsql?: Client };

function client() {
  if (globalForDb.libsql) return globalForDb.libsql;
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = getConfig();
  globalForDb.libsql = createClient({ url, authToken, intMode: "number" });
  return globalForDb.libsql;
}

/** SQL for "now", moved by optional SQLite date modifiers. */
export const isoTime = (...modifiers: string[]) =>
  `strftime('%Y-%m-%dT%H:%M:%fZ', 'now'${modifiers.map((m) => `, ${m}`).join("")})`;

function expand(sql: string) {
  return sql
    .replace(/\$(\d+)/g, "?$1")
    .replace(/\bnow\(([^()]*)\)/gi, (_, mods: string) => isoTime(...(mods.trim() ? [mods.trim()] : [])));
}

function toArg(value: unknown) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value) || (value !== null && typeof value === "object")) return JSON.stringify(value);
  return value as string | number | null;
}

const BOOLEAN_COLUMNS = new Set([
  "is_active",
  "is_test",
  "is_system",
  "is_default",
  "must_change_password",
  "secure",
  "livemode",
  "allow_custom_orders",
  "platform_active",
  "isActive",
  "customOrders",
  "allow",
]);
const JSON_COLUMNS = new Set(["data", "method_details", "google_client_ids", "googleClientIds", "ids", "grants", "urls"]);
const isTimeColumn = (name: string) => /(_at|At)$/.test(name);

function fromValue(column: string, value: unknown) {
  if (value === null || value === undefined) return value ?? null;
  if (BOOLEAN_COLUMNS.has(column)) return value === 1 || value === true || value === "1";
  if (JSON_COLUMNS.has(column) && typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (isTimeColumn(column) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value);
  return value;
}

export interface QueryResult<T> {
  rows: T[];
  /** rows returned, or rows changed by INSERT / UPDATE / DELETE without RETURNING */
  rowCount: number;
}

function toResult<T>(rs: ResultSet): QueryResult<T> {
  const rows = rs.rows.map((row) => {
    const out: Record<string, unknown> = {};
    rs.columns.forEach((name, i) => (out[name] = fromValue(name, row[i])));
    return out as T;
  });
  return { rows, rowCount: rs.columns.length ? rows.length : rs.rowsAffected };
}

// --- errors: SQLite's constraint errors, labelled the way callers check them -------------
// code 23505 unique / 23503 foreign key / 23514 check, and `constraint` with the name of the
// unique index (SQLite names it only for expression indexes; otherwise it lists the columns).

const UNIQUE_BY_COLUMNS: Record<string, string> = {
  "app_users.app_id,app_users.google_sub": "app_users_google_sub_key",
  "permissions.key": "permissions_key_idx",
};

export class DbError extends Error {
  constructor(
    message: string,
    public code: string,
    public constraint?: string,
  ) {
    super(message);
  }
}

function translate(err: unknown): unknown {
  const message = (err as Error)?.message ?? "";
  if (!/SQLITE_CONSTRAINT/.test((err as { code?: string })?.code ?? "") && !/constraint failed/i.test(message)) return err;
  const unique = message.match(/UNIQUE constraint failed: (.+)$/m);
  if (unique) {
    const index = unique[1].match(/^index '([^']+)'/)?.[1];
    const columns = unique[1].replace(/\s+/g, "");
    const table = columns.split(".")[0];
    const name =
      index ?? UNIQUE_BY_COLUMNS[columns] ?? `${table}_${columns.split(",").map((c) => c.split(".")[1]).join("_")}_key`;
    return new DbError(message, "23505", name);
  }
  if (/FOREIGN KEY constraint failed/.test(message)) return new DbError(message, "23503");
  if (/CHECK constraint failed/.test(message)) return new DbError(message, "23514");
  if (/NOT NULL constraint failed/.test(message)) return new DbError(message, "23502");
  return err;
}

async function run<T>(exec: (stmt: { sql: string; args: InArgs }) => Promise<ResultSet>, sql: string, params?: unknown[]) {
  try {
    return toResult<T>(await exec({ sql: expand(sql), args: (params ?? []).map(toArg) }));
  } catch (err) {
    const e = translate(err);
    // the statement (no values) makes a failure in the logs easy to find
    if (e instanceof Error && !(e instanceof DbError)) Object.assign(e, { sql: sql.replace(/\s+/g, " ").slice(0, 300) });
    throw e;
  }
}

/** Something to run queries on: the database, or one transaction (withTransaction). */
export interface DbClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export function query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
  return run<T>((stmt) => client().execute(stmt), text, params);
}

/** Several statements in one round trip, all or nothing (for setup scripts). */
export async function batch(statements: string[]) {
  try {
    await client().batch(statements.map(expand), "write");
  } catch (err) {
    throw translate(err);
  }
}

/**
 * Runs `fn` in a write transaction: everything commits together or not at all. SQLite runs
 * one write transaction at a time, so the rows read in it can't change underneath (no row
 * locks needed).
 */
export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const tx: Transaction = await client().transaction("write");
  const txClient: DbClient = { query: (text, params) => run((stmt) => tx.execute(stmt), text, params) };
  try {
    const result = await fn(txClient);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }
}
