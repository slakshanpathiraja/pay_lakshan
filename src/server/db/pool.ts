import "server-only";
import pg from "pg";
import { getConfig } from "../config";

// One pool per process. Stored on globalThis so dev hot-reloads don't leak pools.
const globalForDb = globalThis as unknown as { pgPool?: pg.Pool };

export function getPool() {
  if (globalForDb.pgPool) return globalForDb.pgPool;
  const config = getConfig();
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    ssl: config.DB_SSL ? { rejectUnauthorized: false } : undefined,
    application_name: "pay",
  });
  // An idle client erroring (e.g. DB restart) must not crash the process;
  // the pool discards it and opens a new one on the next checkout.
  pool.on("error", (err) =>
    console.error("[db] idle client error:", err.message),
  );
  globalForDb.pgPool = pool;
  return pool;
}

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}

/** Runs `fn` inside a transaction and always releases the client back to the pool. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
