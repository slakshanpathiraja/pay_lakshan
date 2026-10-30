import "server-only";
import { currencyDigits } from "@/lib/commerce";
import { platformsOfMode, type PayMode } from "./pay-mode";
import type { Billing, IntervalUnit } from "@/lib/commerce";
import { newOrderNumber, ORDER_STATE, START_PERIOD, STOP_PERIOD } from "./commerce";
import { query, withTransaction, type DbClient } from "./db/pool";
import { ApiError } from "./errors";
import type { PlayClient, PlayProduct, PlaySubscription } from "./google-play";
import { stopStripeBilling } from "./stripe";

// A Google Play purchase on one of our orders. The order's statuses follow Google:
//
//   subscription  ACTIVE / CANCELED (auto-renew off)  paid, active until the expiry
//                 IN_GRACE_PERIOD                     payment failed, still active until the expiry
//                 ON_HOLD / PAUSED / EXPIRED          access ended (expired)
//                 PENDING                             nothing yet (payment pending)
//                 PENDING_PURCHASE_CANCELED           cancelled
//   product       purchased → paid (starts it) · cancelled → cancelled · pending → nothing yet
//   refund / revoke (voided purchase)                 refunded, cancelled
//
// Every change re-reads the purchase from Google, so a notification arriving late or twice
// can't move an order the wrong way.
//
// Which order a purchase pays — the app starts the Play billing flow with:
//   setObfuscatedAccountId(<user id>) only            the webhook creates the order from the
//                                                       purchase: Play product name, price paid,
//                                                       base plan period (no /order call needed)
//   … and setObfuscatedProfileId(<order number>)      it pays that order (made with /order)
// Google returns them with the purchase, so the first notification does it by itself.

export type PlayKind = "subscription" | "product";

export interface PlayState {
  kind: PlayKind;
  productId: string;
  /** what the order becomes */
  outcome: "paid" | "grace" | "ended" | "pending" | "cancelled";
  expiresAt: Date | null;
  startedAt: Date | null;
  /** Google's order id (GPA.…); renewals end in ..1, ..2 */
  googleOrderId: string | null;
  /** the price when Google gives it (subscriptions), in minor units */
  amount: number | null;
  currency: string | null;
  test: boolean;
  acknowledged: boolean;
  /** an older token this purchase replaced (upgrade / resubscribe) */
  linkedToken: string | null;
  /** from the billing flow: our order number and app user id */
  orderNumber: string | null;
  userId: string | null;
  /** the subscription's base plan (its period is set in Play Console) */
  basePlanId: string | null;
}

const SUB_OUTCOME: Record<string, PlayState["outcome"]> = {
  SUBSCRIPTION_STATE_ACTIVE: "paid",
  SUBSCRIPTION_STATE_CANCELED: "paid",
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "grace",
  SUBSCRIPTION_STATE_ON_HOLD: "ended",
  SUBSCRIPTION_STATE_PAUSED: "ended",
  SUBSCRIPTION_STATE_EXPIRED: "ended",
  SUBSCRIPTION_STATE_PENDING: "pending",
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: "cancelled",
};

export function subscriptionState(s: PlaySubscription, productId: string): PlayState {
  const item = s.lineItems?.find((l) => l.productId === productId) ?? s.lineItems?.[0];
  const price = item?.autoRenewingPlan?.recurringPrice;
  const amount = price
    ? Math.round((Number(price.units ?? 0) + (price.nanos ?? 0) / 1e9) * 10 ** currencyDigits(price.currencyCode))
    : null;
  return {
    kind: "subscription",
    productId: item?.productId ?? productId,
    outcome: SUB_OUTCOME[s.subscriptionState] ?? "pending",
    expiresAt: item?.expiryTime ? new Date(item.expiryTime) : null,
    startedAt: s.startTime ? new Date(s.startTime) : null,
    googleOrderId: s.latestOrderId ?? null,
    amount,
    currency: price?.currencyCode ?? null,
    test: !!s.testPurchase,
    acknowledged: s.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    linkedToken: s.linkedPurchaseToken ?? null,
    orderNumber: s.externalAccountIdentifiers?.obfuscatedExternalProfileId ?? null,
    userId: s.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    basePlanId: item?.offerDetails?.basePlanId ?? null,
  };
}

export function productState(p: PlayProduct, productId: string): PlayState {
  return {
    kind: "product",
    productId,
    outcome: p.purchaseState === 0 ? "paid" : p.purchaseState === 1 ? "cancelled" : "pending",
    expiresAt: null,
    startedAt: p.purchaseTimeMillis ? new Date(Number(p.purchaseTimeMillis)) : null,
    googleOrderId: p.orderId ?? null,
    amount: null,
    currency: null,
    test: p.purchaseType === 0,
    acknowledged: p.acknowledgementState === 1,
    linkedToken: null,
    orderNumber: p.obfuscatedExternalProfileId ?? null,
    userId: p.obfuscatedExternalAccountId ?? null,
    basePlanId: null,
  };
}

export async function fetchPlayState(play: PlayClient, pkg: string, kind: PlayKind, productId: string, token: string) {
  return kind === "subscription"
    ? subscriptionState(await play.getSubscription(pkg, token), productId)
    : productState(await play.getProduct(pkg, productId, token), productId);
}

interface PlayOrder {
  id: number;
  platform_id: string;
  app_id: number;
  billing: string;
  currency: string;
  state: string;
  payment_status: string;
  total: number;
}

const ORDER_COLUMNS = `o.id, o.platform_id, o.app_id, o.billing, o.currency, ${ORDER_STATE} AS state, o.payment_status,
  (SELECT COALESCE(SUM(i.quantity * i.unit_amount), 0) FROM order_items i WHERE i.order_id = o.id) AS total`;

/** Records the purchase's payment (renewals each get their own Google order id). */
async function savePlayPayment(client: DbClient, order: PlayOrder, s: PlayState) {
  if (!s.googleOrderId || (s.outcome !== "paid" && s.outcome !== "grace")) return;
  // the first payment's order id has no "..N" ending (or ..0)
  const renewal = /\.\.(\d+)$/.exec(s.googleOrderId);
  await client.query(
    `INSERT INTO payments (platform_id, app_id, order_id, provider, reference, kind, status, amount, currency,
                           method_type, method_details, livemode, paid_at)
     VALUES ($1, $2, $3, 'google_play', $4, $5, 'succeeded', $6, $7, 'google_play', $8, $9, now())
     ON CONFLICT (provider, reference) DO NOTHING`,
    [
      order.platform_id,
      order.app_id,
      order.id,
      s.googleOrderId,
      renewal && Number(renewal[1]) > 0 ? "renewal" : "checkout",
      s.amount ?? order.total,
      s.currency ?? order.currency,
      { product: s.productId },
      !s.test,
    ],
  );
}

/** Moves the order (locked by the caller) to what Google says. */
async function applyPlayState(client: DbClient, order: PlayOrder, s: PlayState) {
  await savePlayPayment(client, order, s);
  if (order.state === "cancelled" && s.outcome !== "cancelled") return; // cancelled here: stays so
  if (s.kind === "subscription") {
    if (s.outcome === "paid" || s.outcome === "grace") {
      const active = !s.expiresAt || s.expiresAt.getTime() > Date.now();
      await client.query(
        `UPDATE orders AS o SET payment_status = $2, paid_at = COALESCE(o.paid_at, now()),
                order_status = $3, starts_at = COALESCE(o.starts_at, $4, now()),
                -- never before the start (the constraint), whatever the dates Google sends
                ends_at = MAX(COALESCE($5, o.starts_at, $4, now()), COALESCE(o.starts_at, $4, now())),
                updated_at = now()
          WHERE o.id = $1`,
        [order.id, s.outcome === "grace" ? "failed" : "paid", active ? "active" : "expired", s.startedAt, s.expiresAt],
      );
    } else if (s.outcome === "ended") {
      await client.query(
        `UPDATE orders AS o SET order_status = CASE WHEN o.order_status = 'active' THEN 'expired' ELSE o.order_status END,
                ends_at = MAX(COALESCE($2, MIN(COALESCE(o.ends_at, now()), now())),
                              COALESCE(o.starts_at, $2, MIN(COALESCE(o.ends_at, now()), now()))), updated_at = now()
          WHERE o.id = $1`,
        [order.id, s.expiresAt],
      );
    } else if (s.outcome === "cancelled") {
      await client.query(
        `UPDATE orders AS o SET order_status = 'cancelled', ${STOP_PERIOD},
                payment_status = CASE WHEN o.payment_status = 'pending' THEN 'failed' ELSE o.payment_status END,
                updated_at = now()
          WHERE o.id = $1`,
        [order.id],
      );
    }
    return;
  }
  // one-time product
  if (s.outcome === "paid") {
    await client.query(
      `UPDATE orders SET payment_status = 'paid', paid_at = COALESCE(paid_at, now()), updated_at = now()
        WHERE id = $1 AND payment_status IN ('pending', 'failed')`,
      [order.id],
    );
    await client.query(
      `UPDATE orders AS o SET order_status = 'active', ${START_PERIOD}
        WHERE o.id = $1 AND o.order_status = 'pending' AND o.payment_status = 'paid'`,
      [order.id],
    );
  } else if (s.outcome === "cancelled") {
    await client.query(
      `UPDATE orders AS o SET order_status = 'cancelled', ${STOP_PERIOD},
              payment_status = CASE WHEN o.payment_status = 'pending' THEN 'failed' ELSE o.payment_status END,
              updated_at = now()
        WHERE o.id = $1`,
      [order.id],
    );
  }
}

async function acknowledge(play: PlayClient, pkg: string, s: PlayState, token: string) {
  if (s.acknowledged || (s.outcome !== "paid" && s.outcome !== "grace")) return;
  // Google refunds purchases not acknowledged within 3 days; a failure here is retried by
  // the next notification / call, so it doesn't undo the order update
  try {
    if (s.kind === "subscription") await play.acknowledgeSubscription(pkg, s.productId, token);
    else await play.acknowledgeProduct(pkg, s.productId, token);
  } catch (err) {
    console.error("[google-play] acknowledge failed", err);
  }
}

type LinkableOrder = PlayOrder & {
  google_purchase_token: string | null;
  checkout_session_id: string | null;
  /** the Play product its template is sold as (if any) */
  template_product: string | null;
};

const LINKABLE = `${ORDER_COLUMNS}, o.google_purchase_token, o.checkout_session_id,
  (SELECT t.google_product_id FROM order_templates t WHERE t.id = o.template_id) AS template_product`;

/**
 * Links a purchase (already read from Google) to its order — one purchase per order — then
 * applies and acknowledges it. Repeating it with the same purchase is harmless.
 */
async function attachPurchase(play: PlayClient, pkg: string, order: LinkableOrder, state: PlayState, token: string) {
  if ((state.kind === "subscription") !== (order.billing === "recurring")) {
    throw new ApiError(409, "GOOGLE_PLAY_TYPE_MISMATCH");
  }
  // made from a template sold as a Play product: only that product pays it
  if (order.template_product && order.template_product !== state.productId) {
    throw new ApiError(409, "GOOGLE_PLAY_PRODUCT_MISMATCH");
  }
  if (order.google_purchase_token && order.google_purchase_token !== token) {
    throw new ApiError(409, "ORDER_ALREADY_PAID");
  }
  if (!order.google_purchase_token && order.payment_status !== "pending" && order.payment_status !== "failed") {
    throw new ApiError(409, "ORDER_ALREADY_PAID");
  }
  // an open Stripe link for the same order must not be paid as well
  if (order.checkout_session_id) {
    await stopStripeBilling({ platform_id: order.platform_id, checkout_session_id: order.checkout_session_id, stripe_subscription_id: null });
  }
  try {
    await withTransaction(async (client) => {
      const { rows: locked } = await client.query<PlayOrder>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1`, [
        order.id,
      ]);
      await client.query(
        `UPDATE orders SET google_purchase_token = $2, google_product_id = $3,
                checkout_session_id = NULL, pay_url = NULL, pay_url_expires_at = NULL, updated_at = now()
          WHERE id = $1`,
        [order.id, token, state.productId],
      );
      await applyPlayState(client, locked[0], state);
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new ApiError(409, "PURCHASE_TOKEN_USED");
    throw err;
  }
  await acknowledge(play, pkg, state, token);
}

/**
 * Before a Google Play subscription order is cancelled here: the subscription is cancelled in
 * Google Play too, so the customer isn't charged again (like Stripe). Skipped when Google has
 * already ended it. One-time products have nothing to stop.
 */
export async function stopGooglePlayBilling(
  play: PlayClient,
  order: { app_id: number; billing: string; google_purchase_token: string | null; google_product_id: string | null },
) {
  if (!order.google_purchase_token || order.billing !== "recurring") return;
  const { rows } = await query<{ identifier: string }>("SELECT identifier FROM apps WHERE id = $1", [order.app_id]);
  const pkg = rows[0]?.identifier;
  if (!pkg) return;
  const sub = await play.getSubscription(pkg, order.google_purchase_token);
  const running = [
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
  ].includes(sub.subscriptionState);
  if (!running) return;
  const productId = sub.lineItems?.[0]?.productId ?? order.google_product_id;
  if (!productId) return;
  await play.cancelSubscription(pkg, productId, order.google_purchase_token);
}

// --- orders made by the webhook from the purchase itself ------------------------------------

/** "P1M" → 1 month, "P1Y" → 1 year, "P2W" → 2 weeks, "P1Y6M" → 18 months; null if it doesn't fit. */
export function periodOf(iso: string | undefined): { unit: IntervalUnit; count: number } | null {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(iso ?? "");
  if (!m) return null;
  const [y, mo, w, d] = m.slice(1).map((v) => Number(v ?? 0));
  const p =
    (w || d) && (y || mo)
      ? null
      : y && !mo
        ? { unit: "year" as const, count: y }
        : y || mo
          ? { unit: "month" as const, count: y * 12 + mo }
          : w && !d
            ? { unit: "week" as const, count: w }
            : w || d
              ? { unit: "day" as const, count: w * 7 + d }
              : null;
  return p && p.count >= 1 && p.count <= 365 ? p : null;
}

/** Play Console product details rarely change: kept for 10 minutes. */
const productCache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = productCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value as T;
  const value = await load();
  productCache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * What an order for this purchase looks like, from Play Console: the product's name, the
 * base plan's period (renewing → subscription, prepaid → one-time for the period; a one-time
 * product → lifetime) and the price — the one the customer paid when Google gives it (renewing
 * subscriptions), else the product's default price.
 */
async function orderFromPlay(play: PlayClient, pkg: string, s: PlayState) {
  const title = (list: { title: string }[]) => list.find((l) => l.title)?.title;
  if (s.kind === "subscription") {
    const product = await cached(`${pkg}|sub|${s.productId}`, () => play.getSubscriptionProduct(pkg, s.productId));
    const plan = product.basePlans?.find((b) => b.basePlanId === s.basePlanId) ?? product.basePlans?.[0];
    const renewing = !!plan?.autoRenewingBasePlanType;
    const period = periodOf(
      plan?.autoRenewingBasePlanType?.billingPeriodDuration ?? plan?.prepaidBasePlanType?.billingPeriodDuration,
    );
    if (!period) throw new Error(`base plan of ${s.productId} has no usable period`);
    // an English title first, when there is one
    const en = (l: { languageCode: string }) => Number(l.languageCode.startsWith("en"));
    const listings = [...(product.listings ?? [])].sort((a, b) => en(b) - en(a));
    return {
      name: title(listings) ?? s.productId,
      billing: (renewing ? "recurring" : "fixed_term") as Billing,
      intervalUnit: period.unit as IntervalUnit | null,
      intervalCount: period.count as number | null,
      currency: s.currency ?? "USD",
      amount: s.amount ?? 0,
    };
  }
  const product = await cached(`${pkg}|inapp|${s.productId}`, () => play.getInappProduct(pkg, s.productId));
  const listings = product.listings ?? {};
  const currency = product.defaultPrice?.currency ?? "USD";
  return {
    name:
      (product.defaultLanguage && listings[product.defaultLanguage]?.title) ||
      title(Object.values(listings)) ||
      s.productId,
    billing: "lifetime" as Billing,
    intervalUnit: null,
    intervalCount: null,
    currency,
    amount: Math.round((Number(product.defaultPrice?.priceMicros ?? 0) / 1e6) * 10 ** currencyDigits(currency)),
  };
}

/**
 * A purchase that names only its user: the order is created here, already linked to the
 * purchase, then paid / activated like any other — all in one transaction, so a notification
 * delivered twice can't make two orders. Linked to the app's template for this Play product,
 * if there is one (for its order count).
 */
async function createOrderFromPurchase(play: PlayClient, pkg: string, appIds: number[], s: PlayState, token: string) {
  if (!s.userId || !/^\d+$/.test(s.userId)) return "ignored" as const;
  if (s.outcome === "cancelled" || s.outcome === "ended") return "ignored" as const; // nothing bought
  const { rows: users } = await query<{ id: number; app_id: number; platform_id: string }>(
    "SELECT id, app_id, platform_id FROM app_users WHERE id = $1 AND app_id IN (SELECT value FROM json_each($2))",
    [Number(s.userId), appIds],
  );
  const user = users[0];
  if (!user) return "ignored" as const; // not a user of this app
  const details = await orderFromPlay(play, pkg, s);
  const { rows: templates } = await query<{ id: number }>(
    "SELECT id FROM order_templates WHERE app_id = $1 AND google_product_id = $2 ORDER BY is_active DESC, id LIMIT 1",
    [user.app_id, s.productId],
  );
  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO orders (platform_id, app_id, app_user_id, order_number, currency, billing, interval_unit,
                             interval_count, note, template_id, google_purchase_token, google_product_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Bought in Google Play', $9, $10, $11) RETURNING id`,
        [
          user.platform_id,
          user.app_id,
          user.id,
          newOrderNumber(),
          details.currency,
          details.billing,
          details.intervalUnit,
          details.intervalCount,
          templates[0]?.id ?? null,
          token,
          s.productId,
        ],
      );
      await client.query("INSERT INTO order_items (order_id, name, quantity, unit_amount) VALUES ($1, $2, 1, $3)", [
        rows[0].id,
        details.name,
        details.amount,
      ]);
      const { rows: locked } = await client.query<PlayOrder>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1`, [
        rows[0].id,
      ]);
      await applyPlayState(client, locked[0], s);
    });
  } catch (err) {
    // the same purchase delivered twice at once: the other delivery made the order
    if ((err as { code?: string }).code === "23505") return "handled" as const;
    throw err;
  }
  await acknowledge(play, pkg, s, token);
  return "handled" as const;
}

// --- the Google Play webhook: Real-time developer notifications (Pub/Sub push) ------------

/** DeveloperNotification — the base64 `message.data` of a push. */
export interface DeveloperNotification {
  version?: string;
  packageName: string;
  eventTimeMillis?: string;
  subscriptionNotification?: { notificationType: number; purchaseToken: string; subscriptionId: string };
  oneTimeProductNotification?: { notificationType: number; purchaseToken: string; sku: string };
  voidedPurchaseNotification?: { purchaseToken: string; orderId: string; productType: number; refundType?: number };
  testNotification?: { version: string };
}

export type PlayNotificationResult = "handled" | "ignored" | "test";

export function decodePush(body: unknown): DeveloperNotification {
  const data = (body as { message?: { data?: string } } | null)?.message?.data;
  if (!data) throw new ApiError(400, "VALIDATION_ERROR", [{ path: "message.data", message: "Missing" }]);
  try {
    return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as DeveloperNotification;
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", [{ path: "message.data", message: "Not base64 JSON" }]);
  }
}

/** One notification: the purchase is read from Google again and the order follows it. */
export async function handlePlayNotification(
  play: PlayClient,
  n: DeveloperNotification,
  mode: PayMode,
): Promise<PlayNotificationResult> {
  if (n.testNotification) return "test";
  // only apps on platforms of the Play account the push came from (test vs normal)
  const { rows: apps } = await query<{ id: number }>(
    `SELECT id FROM apps WHERE kind = 'app_id' AND identifier = $1 AND platform_id IN (${platformsOfMode("$2")})`,
    [n.packageName, mode === "test"],
  );
  const appIds = apps.map((a) => a.id);
  if (!appIds.length) return "ignored"; // another app on the same Play account

  const find = async (token: string) =>
    (
      await query<{ id: number; google_product_id: string }>(
        "SELECT id, google_product_id FROM orders WHERE google_purchase_token = $1 AND app_id IN (SELECT value FROM json_each($2))",
        [token, appIds],
      )
    ).rows[0];

  if (n.voidedPurchaseNotification) {
    const v = n.voidedPurchaseNotification;
    const order = await find(v.purchaseToken);
    if (!order) return "ignored";
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE payments SET status = 'refunded', amount_refunded = amount, updated_at = now() WHERE provider = 'google_play' AND reference = $1",
        [v.orderId],
      );
      await client.query(
        `UPDATE orders AS o SET payment_status = 'refunded', order_status = 'cancelled', ${STOP_PERIOD}, updated_at = now()
          WHERE o.id = $1`,
        [order.id],
      );
    });
    return "handled";
  }

  const sub = n.subscriptionNotification;
  const one = n.oneTimeProductNotification;
  if (!sub && !one) return "ignored";
  const token = (sub ?? one)!.purchaseToken;
  const productId = sub ? sub.subscriptionId : one!.sku;
  const kind: PlayKind = sub ? "subscription" : "product";
  const state = await fetchPlayState(play, n.packageName, kind, productId, token);
  let order = await find(token);
  // a new token that replaces an older one (upgrade, resubscribe): the order moves to it
  if (!order && state.linkedToken) {
    const old = await find(state.linkedToken);
    if (old) {
      await query("UPDATE orders SET google_purchase_token = $2 WHERE id = $1", [old.id, token]);
      order = old;
    }
  }
  if (!order) {
    // the first notification of a purchase. Only the user named: the order is created now
    if (!state.orderNumber) return createOrderFromPurchase(play, n.packageName, appIds, state, token);
    // the billing flow named an order (made with /order) and its user
    if (!state.userId || !/^\d+$/.test(state.userId)) return "ignored";
    const { rows } = await query<LinkableOrder>(
      `SELECT ${LINKABLE} FROM orders o WHERE o.order_number = $1 AND o.app_id IN (SELECT value FROM json_each($2)) AND o.app_user_id = $3`,
      [state.orderNumber, appIds, Number(state.userId)],
    );
    if (!rows[0]) return "ignored";
    try {
      await attachPurchase(play, n.packageName, rows[0], state, token);
    } catch (err) {
      // a mismatch (wrong type, order already paid) won't fix itself: don't make Pub/Sub retry
      if (err instanceof ApiError && err.status === 409) {
        console.warn(`[google-play] purchase for ${state.orderNumber} not linked: ${err.code}`);
        return "ignored";
      }
      throw err;
    }
    return "handled";
  }
  await withTransaction(async (client) => {
    const { rows } = await client.query<PlayOrder>(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1`, [order.id]);
    await applyPlayState(client, rows[0], state);
  });
  await acknowledge(play, n.packageName, state, token);
  return "handled";
}
