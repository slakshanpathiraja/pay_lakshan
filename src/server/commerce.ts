import "server-only";
import { randomBytes } from "node:crypto";
import { query, type DbClient } from "./db/pool";
import { ApiError, type ErrorCode } from "./errors";

/**
 * Turns database constraint errors into API errors: unique violations (23505) by index /
 * constraint name, foreign key violations (23503) into `foreignKey`. Rethrows anything else.
 */
export function mapDbError(
  err: unknown,
  map: { unique?: Record<string, ErrorCode>; foreignKey?: ErrorCode },
): never {
  const e = err as { code?: string; constraint?: string };
  if (e.code === "23505" && map.unique) {
    const code =
      (e.constraint && map.unique[e.constraint]) ??
      Object.values(map.unique)[0];
    if (code) throw new ApiError(409, code);
  }
  if (e.code === "23503" && map.foreignKey)
    throw new ApiError(409, map.foreignKey);
  throw err;
}

/** e.g. "ORD-261026-K7Q2XM": date + random, readable over the phone. */
export function newOrderNumber(now = new Date()) {
  const date = now.toISOString().slice(2, 10).replaceAll("-", "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = [...randomBytes(6)]
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  return `ORD-${date}-${random}`;
}

/**
 * SQL: `from` moved forward by order `o`'s period, as ISO time text — e.g. 31 Jan + 1 month
 * = 28 Feb ('floor' keeps it in the shorter month, like Postgres did); a week is 7 days.
 */
export const afterPeriod = (from: string) =>
  `strftime('%Y-%m-%dT%H:%M:%fZ', ${from}, CASE o.interval_unit WHEN 'week' THEN '+' || (o.interval_count * 7) || ' days'
     ELSE '+' || o.interval_count || ' ' || o.interval_unit || 's' END, 'floor')`;

/** SQL: order `o`'s status as shown — an active order past its end date is expired. */
export const ORDER_STATE = `CASE WHEN o.order_status = 'active' AND o.ends_at IS NOT NULL AND o.ends_at <= now()
  THEN 'expired' ELSE o.order_status END`;

/** SQL: start a new access period from now (lifetime: no end). */
export const START_PERIOD = `starts_at = now(),
  ends_at = CASE WHEN o.billing = 'lifetime' THEN NULL ELSE ${afterPeriod("now()")} END`;

/** SQL: end a running access period now (keeps an end that already passed). */
export const STOP_PERIOD = `ends_at = CASE WHEN o.starts_at IS NOT NULL AND (o.ends_at IS NULL OR o.ends_at > now())
  THEN now() ELSE o.ends_at END`;

/** SQL: order `o`'s payment link while it still works (a Checkout link expires; an invoice's doesn't). */
export const PAY_URL = `CASE WHEN o.pay_url_expires_at IS NULL OR o.pay_url_expires_at > now() THEN o.pay_url END AS pay_url,
  CASE WHEN o.pay_url_expires_at > now() THEN o.pay_url_expires_at END AS pay_url_expires_at`;

/**
 * Stores "expired" on active orders whose period has ended (lists already show them as
 * expired; this makes the stored status match). Run by the health check's cron job.
 */
export async function expireOverdueOrders() {
  const { rowCount } = await query(
    `UPDATE orders SET order_status = 'expired', updated_at = now()
      WHERE order_status = 'active' AND ends_at IS NOT NULL AND ends_at <= now()`,
  );
  return rowCount ?? 0;
}

/**
 * SQL: what the dashboard gets of an app user (`u`) — every column except the password hash
 * (App API sign in), which never leaves the server.
 */
export const APP_USER_COLUMNS = `u.id, u.platform_id, u.app_id, u.name, u.email, u.phone, u.phone_country,
  u.max_devices, u.max_pending_orders, u.is_active, u.created_at, u.updated_at`;

/** SQL: an order template (`t`) as the API returns it. */
export const TEMPLATE_COLUMNS = `t.id, t.platform_id, t.app_id, t.code, t.name, t.currency,
  t.unit_amount AS unit_amount, t.billing, t.interval_unit, t.interval_count, t.google_product_id,
  t.is_active, t.created_at, t.updated_at`;

/** The same columns for RETURNING, where SQLite allows no table alias. */
export const APP_USER_RETURNING = APP_USER_COLUMNS.replaceAll("u.", "");
export const TEMPLATE_RETURNING = TEMPLATE_COLUMNS.replaceAll("t.", "");
/** Unique indexes of order_templates → error codes. */
export const TEMPLATE_UNIQUE = {
  order_templates_app_id_code_key: "TEMPLATE_CODE_TAKEN",
} as const satisfies Record<string, ErrorCode>;

/** Unique indexes of app_users → error codes. */
export const USER_UNIQUE = {
  app_users_email_idx: "APP_USER_EMAIL_TAKEN",
} as const satisfies Record<string, ErrorCode>;

/**
 * A user may have up to `max_devices` active devices. Locks the user row so two devices
 * can't take the last slot at once; `exceptDeviceId` is the device being saved.
 */
export async function assertDeviceSlot(
  client: DbClient,
  appUserId: number,
  exceptDeviceId: number | null,
) {
  const { rows } = await client.query<{ max_devices: number }>(
    "SELECT max_devices FROM app_users WHERE id = $1",
    [appUserId],
  );
  if (!rows[0]) return; // not a user of this app: the foreign key reports it
  const { rows: used } = await client.query<{ n: number }>(
    `SELECT count(*) AS n FROM devices
      WHERE app_user_id = $1 AND is_active AND ($2 IS NULL OR id <> $2)`,
    [appUserId, exceptDeviceId],
  );
  if (used[0].n >= rows[0].max_devices)
    throw new ApiError(409, "DEVICE_LIMIT_REACHED");
}
