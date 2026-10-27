import "server-only";
import type Stripe from "stripe";
import type pg from "pg";
import type { PaymentRecordStatus } from "@/lib/commerce";
import { START_PERIOD, STOP_PERIOD } from "./commerce";
import { query, withTransaction } from "./db/pool";

// What a Stripe webhook event does to orders and payments. Every handler first reads the
// current objects from Stripe (events can arrive late or out of order, so their payload
// may be stale), then applies them in one transaction together with recording the event
// id — a redelivered event is skipped, and a failed one rolls back and is retried by Stripe.
//
//   checkout.session.completed / async_payment_*   one-time order paid / processing / failed;
//                                                  a subscription order gets its subscription
//   invoice.paid                                   subscription paid (first or renewal): active
//                                                  until the new period end
//   invoice.payment_failed                         payment failed: the order keeps its end date
//                                                  (the health check expires it) and gets the
//                                                  invoice's pay link; paying it later makes it
//                                                  active again with the new period
//   customer.subscription.deleted                  order cancelled
//   charge.refunded                                payment (partly) refunded; a fully refunded
//                                                  one-time order is cancelled
//   checkout.session.expired                       the order's payment link is cleared

type Apply = (client: pg.PoolClient) => Promise<void>;
export type WebhookResult = "handled" | "ignored" | "duplicate";

interface PaymentRecord {
  reference: string;
  kind: "checkout" | "renewal";
  invoiceId: string | null;
  status: PaymentRecordStatus;
  amount: number;
  amountRefunded: number;
  currency: string;
  methodType: string | null;
  methodDetails: Record<string, string> | null;
  receiptUrl: string | null;
  failureMessage: string | null;
  livemode: boolean;
  paidAt: number | null;
}

interface OrderRef {
  id: number;
  platform_id: string;
  app_id: number;
  billing: string;
}

const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : (v?.id ?? null);
/**
 * The order a Checkout session / subscription was made for (our metadata). Its number must
 * match too: every environment sharing the Stripe account gets every event, and another
 * database can have an order with the same id.
 */
const orderOf = (metadata: Stripe.Metadata | null | undefined) => {
  const id = Number(metadata?.order_id);
  const number = metadata?.order_number;
  return Number.isInteger(id) && id > 0 && number ? { id, number } : null;
};

/** Non-sensitive details worth showing for a payment method (never fingerprints or full numbers). */
const SHOWN_DETAILS = new Set([
  "brand",
  "last4",
  "funding",
  "country",
  "network",
  "bank_name",
  "bank",
  "email",
  "payer_email",
  "verified_name",
  "account_type",
  "buyer_id",
]);

function methodOf(d: Stripe.Charge.PaymentMethodDetails | null | undefined) {
  if (!d) return { methodType: null, methodDetails: null };
  const details: Record<string, string> = {};
  if (d.card) {
    for (const k of ["brand", "last4", "funding", "country"] as const) {
      if (d.card[k]) details[k] = String(d.card[k]);
    }
    details.exp = `${String(d.card.exp_month).padStart(2, "0")}/${d.card.exp_year}`;
    if (d.card.wallet?.type) details.wallet = d.card.wallet.type;
  } else {
    const raw = (d as unknown as Record<string, unknown>)[d.type];
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        if (
          SHOWN_DETAILS.has(k) &&
          (typeof v === "string" || typeof v === "number")
        )
          details[k] = String(v);
      }
    }
  }
  return {
    methodType: d.type,
    methodDetails: Object.keys(details).length ? details : null,
  };
}

/** The payment as Stripe has it now: amount, method, refunds, failure. */
async function paymentRecord(
  stripe: Stripe,
  paymentIntentId: string,
  kind: PaymentRecord["kind"],
  invoiceId: string | null,
): Promise<PaymentRecord> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const status: PaymentRecordStatus =
    pi.status === "succeeded"
      ? charge?.refunded
        ? "refunded"
        : charge?.amount_refunded
          ? "partially_refunded"
          : "succeeded"
      : pi.status === "canceled" || pi.status === "requires_payment_method"
        ? "failed"
        : "processing";
  return {
    reference: pi.id,
    kind,
    invoiceId,
    status,
    amount: pi.amount_received || pi.amount,
    amountRefunded: charge?.amount_refunded ?? 0,
    currency: pi.currency.toUpperCase(),
    ...methodOf(charge?.payment_method_details),
    receiptUrl: charge?.receipt_url ?? null,
    failureMessage:
      (
        pi.last_payment_error?.message ??
        charge?.failure_message ??
        null
      )?.slice(0, 500) ?? null,
    livemode: pi.livemode,
    paidAt:
      status === "failed" || status === "processing"
        ? null
        : (charge?.created ?? pi.created),
  };
}

async function savePayment(
  client: pg.PoolClient,
  order: OrderRef,
  p: PaymentRecord,
) {
  await client.query(
    `INSERT INTO payments (platform_id, app_id, order_id, reference, kind, invoice_id, status, amount,
                           amount_refunded, currency, method_type, method_details, receipt_url,
                           failure_message, livemode, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, to_timestamp($16))
     ON CONFLICT (provider, reference) DO UPDATE SET
       status = EXCLUDED.status,
       amount = EXCLUDED.amount,
       amount_refunded = EXCLUDED.amount_refunded,
       invoice_id = COALESCE(EXCLUDED.invoice_id, payments.invoice_id),
       method_type = COALESCE(EXCLUDED.method_type, payments.method_type),
       method_details = COALESCE(EXCLUDED.method_details, payments.method_details),
       receipt_url = COALESCE(EXCLUDED.receipt_url, payments.receipt_url),
       failure_message = EXCLUDED.failure_message,
       paid_at = COALESCE(payments.paid_at, EXCLUDED.paid_at),
       updated_at = now()`,
    [
      order.platform_id,
      order.app_id,
      order.id,
      p.reference,
      p.kind,
      p.invoiceId,
      p.status,
      p.amount,
      p.amountRefunded,
      p.currency,
      p.methodType,
      p.methodDetails,
      p.receiptUrl,
      p.failureMessage,
      p.livemode,
      p.paidAt,
    ],
  );
}

/** The order (any platform) by our metadata or by its Stripe subscription, locked. */
async function lockOrder(
  client: pg.PoolClient,
  by: {
    order?: { id: number; number: string } | null;
    subscriptionId?: string | null;
  },
) {
  const { rows } = await client.query<OrderRef>(
    `SELECT id, platform_id, app_id, billing FROM orders
      WHERE (id = $1 AND order_number = $2) OR stripe_subscription_id = $3
      ORDER BY (id = $1) DESC NULLS LAST LIMIT 1
      FOR UPDATE`,
    [by.order?.id ?? null, by.order?.number ?? null, by.subscriptionId ?? null],
  );
  return rows[0] ?? null;
}

const CLEAR_LINK =
  "checkout_session_id = NULL, pay_url = NULL, pay_url_expires_at = NULL";

/** A one-time order's Checkout payment: paid (starts it), still processing, or failed. */
async function checkoutPayment(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const orderRef = orderOf(session.metadata);
  const piId = idOf(session.payment_intent);
  if (!orderRef || !piId) return null;
  const record = await paymentRecord(stripe, piId, "checkout", null);
  const customer = idOf(session.customer);
  return (async (client) => {
    const order = await lockOrder(client, { order: orderRef });
    if (!order) return;
    await savePayment(client, order, record);
    await client.query(
      `UPDATE orders SET ${CLEAR_LINK}, stripe_customer_id = COALESCE(stripe_customer_id, $3)
        WHERE id = $1 AND checkout_session_id = $2`,
      [order.id, session.id, customer],
    );
    if (record.status === "succeeded") {
      await client.query(
        `UPDATE orders SET payment_status = 'paid', paid_at = now(), updated_at = now()
          WHERE id = $1 AND payment_status IN ('pending', 'failed')`,
        [order.id],
      );
      await client.query(
        `UPDATE orders o SET order_status = 'active', ${START_PERIOD}
          WHERE o.id = $1 AND o.order_status = 'pending' AND o.payment_status = 'paid'`,
        [order.id],
      );
    } else if (record.status === "failed") {
      await client.query(
        "UPDATE orders SET payment_status = 'failed', updated_at = now() WHERE id = $1 AND payment_status = 'pending'",
        [order.id],
      );
    }
  }) satisfies Apply;
}

/**
 * A subscription invoice as Stripe has it now. Paid: the order is paid and active until the
 * invoice's period end (an expired one comes back). Still open after a failed attempt: the
 * payment failed, and the invoice's page becomes the order's pay link.
 */
async function invoiceUpdate(stripe: Stripe, invoiceId: string) {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const details = invoice.parent?.subscription_details;
  if (!details) return null; // not a subscription invoice
  const subscriptionId = idOf(details.subscription);
  const orderRef = orderOf(details.metadata);
  const kind =
    invoice.billing_reason === "subscription_create" ? "checkout" : "renewal";
  const { data: invoicePayments } = await stripe.invoicePayments.list({
    invoice: invoice.id,
    limit: 10,
  });
  const latest =
    invoicePayments.find((p) => p.is_default) ?? invoicePayments[0];
  const piId = idOf(latest?.payment.payment_intent);
  const record = piId
    ? await paymentRecord(stripe, piId, kind, invoice.id)
    : null;
  const periods = invoice.lines.data.map((l) => l.period);
  const start = Math.min(...periods.map((p) => p.start));
  const end = Math.max(...periods.map((p) => p.end));
  const customer = idOf(invoice.customer);

  return (async (client) => {
    const order = await lockOrder(client, {
      order: orderRef,
      subscriptionId,
    });
    if (!order) return;
    if (record) await savePayment(client, order, record);
    await client.query(
      `UPDATE orders SET stripe_subscription_id = COALESCE(stripe_subscription_id, $2),
              stripe_customer_id = COALESCE(stripe_customer_id, $3)
        WHERE id = $1`,
      [order.id, subscriptionId, customer],
    );
    if (invoice.status === "paid" && periods.length) {
      await client.query(
        `UPDATE orders o SET
                payment_status = CASE WHEN o.payment_status = 'refunded' THEN o.payment_status ELSE 'paid' END,
                paid_at = now(),
                order_status = CASE WHEN o.order_status = 'cancelled' THEN 'cancelled' ELSE 'active' END,
                starts_at = COALESCE(o.starts_at, to_timestamp($2)),
                ends_at = GREATEST(o.ends_at, to_timestamp($3)),
                ${CLEAR_LINK}, updated_at = now()
          WHERE o.id = $1`,
        [order.id, start, end],
      );
    } else if (invoice.status === "open" && record?.status === "failed") {
      await client.query(
        `UPDATE orders SET payment_status = 'failed', checkout_session_id = NULL,
                pay_url = $2, pay_url_expires_at = NULL, updated_at = now()
          WHERE id = $1 AND payment_status <> 'refunded'`,
        [order.id, invoice.hosted_invoice_url ?? null],
      );
    }
  }) satisfies Apply;
}

/** Reads what the event is about from Stripe and returns what to change (null: nothing). */
async function prepare(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<Apply | null> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      if (session.mode === "payment") return checkoutPayment(stripe, session);
      if (session.mode !== "subscription") return null;
      const orderRef = orderOf(session.metadata);
      const subscriptionId = idOf(session.subscription);
      const invoiceId = idOf(session.invoice);
      const invoice = invoiceId ? await invoiceUpdate(stripe, invoiceId) : null;
      return async (client) => {
        const order = await lockOrder(client, {
          order: orderRef,
          subscriptionId,
        });
        if (!order) return;
        await client.query(
          `UPDATE orders SET stripe_subscription_id = COALESCE(stripe_subscription_id, $2),
                  stripe_customer_id = COALESCE(stripe_customer_id, $3), updated_at = now()
            WHERE id = $1`,
          [order.id, subscriptionId, idOf(session.customer)],
        );
        await client.query(
          `UPDATE orders SET ${CLEAR_LINK} WHERE id = $1 AND checkout_session_id = $2`,
          [order.id, session.id],
        );
        await invoice?.(client);
      };
    }

    case "checkout.session.expired": {
      const session = event.data.object;
      return async (client) => {
        await client.query(
          `UPDATE orders SET ${CLEAR_LINK}, updated_at = now() WHERE checkout_session_id = $1`,
          [session.id],
        );
      };
    }

    case "invoice.paid":
    case "invoice.payment_failed":
      return event.data.object.id
        ? invoiceUpdate(stripe, event.data.object.id)
        : null;

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      return async (client) => {
        const order = await lockOrder(client, {
          order: orderOf(subscription.metadata),
          subscriptionId: subscription.id,
        });
        if (!order) return;
        await client.query(
          `UPDATE orders o SET order_status = 'cancelled', ${STOP_PERIOD}, ${CLEAR_LINK}, updated_at = now()
            WHERE o.id = $1 AND o.order_status <> 'cancelled'`,
          [order.id],
        );
      };
    }

    case "charge.refunded": {
      const piId = idOf(event.data.object.payment_intent);
      if (!piId) return null;
      const { rows } = await query<{
        kind: PaymentRecord["kind"];
        invoice_id: string | null;
      }>(
        "SELECT kind, invoice_id FROM payments WHERE provider = 'stripe' AND reference = $1",
        [piId],
      );
      if (!rows[0]) return null; // a payment this database never recorded
      const record = await paymentRecord(
        stripe,
        piId,
        rows[0].kind,
        rows[0].invoice_id,
      );
      return async (client) => {
        const { rows: paid } = await client.query<OrderRef>(
          `SELECT o.id, o.platform_id, o.app_id, o.billing FROM payments p JOIN orders o ON o.id = p.order_id
            WHERE p.reference = $1 FOR UPDATE OF o`,
          [piId],
        );
        const order = paid[0];
        if (!order) return;
        await savePayment(client, order, record);
        // a subscription keeps running in Stripe: only its payment shows the refund
        if (record.status === "refunded" && order.billing !== "recurring") {
          await client.query(
            `UPDATE orders o SET payment_status = 'refunded', order_status = 'cancelled', ${STOP_PERIOD},
                    updated_at = now()
              WHERE o.id = $1 AND o.payment_status = 'paid'`,
            [order.id],
          );
        }
      };
    }

    default:
      return null;
  }
}

export async function handleStripeEvent(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<WebhookResult> {
  const { rowCount: seen } = await query(
    "SELECT 1 FROM stripe_events WHERE id = $1",
    [event.id],
  );
  if (seen) return "duplicate";
  const apply = await prepare(stripe, event);
  return withTransaction(async (client) => {
    const { rowCount: fresh } = await client.query(
      "INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [event.id, event.type],
    );
    if (!fresh) return "duplicate";
    if (!apply) return "ignored";
    await apply(client);
    return "handled";
  });
}
