import "server-only";
import type { Billing, Currency, IntervalUnit } from "@/lib/commerce";
import { newOrderNumber } from "./commerce";
import { query, withTransaction } from "./db/pool";
import { enqueueEmail } from "./email/outbox";
import { ApiError } from "./errors";
import { errorMessage } from "./messages";
import { getAppOrigin } from "./config";
import { createCheckout } from "./stripe";

export interface NewOrder {
  platformId: string;
  appId: number;
  appUserId: number;
  currency: Currency;
  billing: Billing;
  /** for fixed_term / recurring */
  intervalUnit?: IntervalUnit | null;
  intervalCount?: number | null;
  note: string | null;
  /** unit amounts in minor units */
  items: { name: string; quantity: number; unitAmount: number }[];
  /**
   * false: no Stripe payment link — the order is paid another way (Google Play in the app,
   * or marked paid by hand). Default true.
   */
  createCheckout?: boolean;
  /** the template it was made from (its details are copied into the order) */
  templateId?: number | null;
}

/**
 * What an order made from an app's template contains: the template's item, price and billing
 * (by id from the dashboard, by code from the App API). Inactive templates can't be used.
 */
export async function fromTemplate(appId: number, by: { id?: number; code?: string }) {
  const { rows } = await query<{
    id: number;
    name: string;
    currency: Currency;
    unit_amount: number;
    billing: Billing;
    interval_unit: IntervalUnit | null;
    interval_count: number | null;
    is_active: boolean;
  }>(
    `SELECT id, name, currency, unit_amount AS unit_amount, billing, interval_unit, interval_count, is_active
       FROM order_templates WHERE app_id = $1 AND (id = $2 OR code = $3)`,
    [appId, by.id ?? null, by.code?.toLowerCase() ?? null],
  );
  const t = rows[0];
  if (!t) throw new ApiError(400, "INVALID_TEMPLATE");
  if (!t.is_active) throw new ApiError(409, "TEMPLATE_INACTIVE");
  return {
    templateId: t.id,
    currency: t.currency,
    billing: t.billing,
    intervalUnit: t.interval_unit,
    intervalCount: t.interval_count,
    items: [{ name: t.name, quantity: 1, unitAmount: t.unit_amount }],
  };
}

/**
 * A new order (payment and order pending) for a user of the app — from the dashboard or an
 * app (App API). A user may have up to `max_pending_orders` pending orders (default 3).
 * When Stripe is configured the order also gets a payment link right away; if Stripe
 * refuses it, the order is still created and `checkoutError` says why. The user gets an
 * email with the order (and its payment link).
 */
export async function createOrder(input: NewOrder, req: Request) {
  const period = input.billing === "lifetime" ? null : input;
  const order = await withTransaction(async (client) => {
    // the user row is locked so two orders can't take the last pending slot at once
    const { rows: users } = await client.query<{ max_pending_orders: number }>(
      "SELECT max_pending_orders FROM app_users WHERE id = $1 AND app_id = $2",
      [input.appUserId, input.appId],
    );
    if (!users[0]) throw new ApiError(400, "INVALID_USER");
    const { rows: pending } = await client.query<{ n: number }>(
      "SELECT count(*) AS n FROM orders WHERE app_user_id = $1 AND order_status = 'pending'",
      [input.appUserId],
    );
    if (pending[0].n >= users[0].max_pending_orders) {
      throw new ApiError(409, "PENDING_ORDER_LIMIT");
    }
    const { rows } = await client.query<{ id: number; order_number: string }>(
      `INSERT INTO orders (platform_id, app_id, app_user_id, order_number, currency, billing,
                           interval_unit, interval_count, note, template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, order_number`,
      [
        input.platformId,
        input.appId,
        input.appUserId,
        newOrderNumber(),
        input.currency,
        input.billing,
        period?.intervalUnit ?? null,
        period?.intervalCount ?? null,
        input.note,
        input.templateId ?? null,
      ],
    );
    for (const item of input.items) {
      await client.query(
        "INSERT INTO order_items (order_id, name, quantity, unit_amount) VALUES ($1, $2, $3, $4)",
        [rows[0].id, item.name, item.quantity, item.unitAmount],
      );
    }
    return rows[0];
  });

  let checkout: { url: string; expiresAt: string } | null = null;
  let checkoutError: string | null = null;
  try {
    if (input.createCheckout !== false) {
      checkout = await createCheckout(order.id, getAppOrigin(req));
    }
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("[orders] payment link", err);
    const details = err instanceof ApiError && Array.isArray(err.details) ? ` (${err.details.join(", ")})` : "";
    checkoutError = errorMessage(err instanceof ApiError ? err.code : "INTERNAL_ERROR", req) + details;
  }
  const { rows: users } = await query<{ email: string | null }>("SELECT email FROM app_users WHERE id = $1", [
    input.appUserId,
  ]);
  await enqueueEmail({
    platformId: input.platformId,
    template: "order-created",
    to: users[0]?.email ?? null,
    data: { orderId: order.id },
  });
  return { order, checkout, checkoutError };
}
