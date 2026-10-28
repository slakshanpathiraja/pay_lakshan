import "server-only";
import { formatMoney } from "@/lib/commerce";
import { ORDER_STATE, PAY_URL } from "../commerce";
import { query } from "../db/pool";
import type { EmailTemplate } from "./render";

// What each queued email says: the template's values, read when it is sent (so an order email
// shows the order as it is then). Returns null when there is nothing to tell any more.

export interface OutboxRow {
  id: number;
  platform_id: string;
  template: EmailTemplate;
  to_email: string;
  data: Record<string, unknown>;
  attempts: number;
  created_at: Date;
}

const OS_NAMES: Record<string, string> = {
  android: "Android",
  ios: "iOS",
  web: "Web browser",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  other: "Other device",
};
const PAYMENT_NAMES: Record<string, string> = { pending: "Not paid yet", paid: "Paid", failed: "Failed", refunded: "Refunded" };
const STATUS_NAMES: Record<string, string> = { pending: "Waiting for payment", active: "Active", expired: "Expired", cancelled: "Cancelled" };

/** "26 Nov 2026, 10:00 UTC" — the user's time zone isn't known. */
const when = (d: Date | string) =>
  `${new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function billingText(billing: string, unit: string | null, count: number | null) {
  const period = unit && count ? `${count} ${unit}${count === 1 ? "" : "s"}` : "";
  if (billing === "recurring") return `Subscription, renews every ${period}`;
  if (billing === "fixed_term") return `One-time, access for ${period}`;
  return "One-time, lifetime access";
}

/** App + platform names and the address users can write to (the platform's support / reply-to email). */
async function context(appId: number) {
  const { rows } = await query<{
    app_name: string;
    platform_name: string;
    from_email: string | null;
    reply_to: string | null;
  }>(
    `SELECT a.name AS app_name, p.name AS platform_name,
            (SELECT s.from_email FROM smtp_servers s
              WHERE s.platform_id = p.id AND s.is_active ORDER BY s.is_default DESC, s.id LIMIT 1) AS from_email,
            (SELECT s.reply_to FROM smtp_servers s
              WHERE s.platform_id = p.id AND s.is_active ORDER BY s.is_default DESC, s.id LIMIT 1) AS reply_to
       FROM apps a JOIN platforms p ON p.id = a.platform_id
      WHERE a.id = $1`,
    [appId],
  );
  const c = rows[0];
  if (!c) return null;
  const supportEmail =
    c.reply_to?.trim() ||
    (c.from_email && /^no-?reply@/i.test(c.from_email)
      ? c.from_email.replace(/^no-?reply@/i, "info@")
      : c.from_email) ||
    "";
  return { appName: c.app_name, platformName: c.platform_name, supportEmail };
}

async function userName(appUserId: unknown, fallback: string) {
  const { rows } = await query<{ name: string }>("SELECT name FROM app_users WHERE id = $1", [Number(appUserId)]);
  return rows[0]?.name ?? fallback;
}

interface OrderNow {
  id: number;
  app_id: number;
  order_number: string;
  payment_status: string;
  status: string;
  billing: string;
  interval_unit: string | null;
  interval_count: number | null;
  currency: string;
  ends_at: Date | null;
  pay_url: string | null;
  pay_url_expires_at: Date | null;
  user_name: string;
}

async function orderNow(id: unknown) {
  const { rows } = await query<OrderNow>(
    `SELECT o.id, o.app_id, o.order_number, o.payment_status, ${ORDER_STATE} AS status, o.billing,
            o.interval_unit, o.interval_count, o.currency, o.ends_at, ${PAY_URL}, u.name AS user_name
       FROM orders o JOIN app_users u ON u.id = o.app_user_id
      WHERE o.id = $1`,
    [Number(id)],
  );
  return rows[0] ?? null;
}

/** Headline and sentence for an order whose statuses changed. */
function orderChange(o: OrderNow, oldPayment: string, oldStatus: string) {
  const until = o.ends_at ? ` until ${day(o.ends_at)}` : " — it never expires";
  if (o.payment_status === "refunded" && oldPayment !== "refunded")
    return { headline: "Order refunded", message: "your payment was refunded and the order is cancelled." };
  if (o.payment_status === "failed" && oldPayment !== "failed")
    return {
      headline: "Payment failed",
      message:
        "we couldn't take the payment for your order." +
        (o.pay_url ? " Please pay with the button below." : " Please contact us to sort it out.") +
        (o.status === "active" && o.ends_at ? ` Your access continues until ${day(o.ends_at)}.` : ""),
    };
  if (o.status === "expired" && oldStatus !== "expired")
    return {
      headline: "Your access has ended",
      message: `your order ended${o.ends_at ? ` on ${day(o.ends_at)}` : ""}.` + (o.pay_url ? " Pay below to continue." : ""),
    };
  if (o.status === "cancelled" && oldStatus !== "cancelled")
    return { headline: "Order cancelled", message: "your order was cancelled and its access has stopped." };
  if (o.status === "active" && oldStatus !== "active")
    return oldStatus === "pending"
      ? { headline: "Payment received", message: `thank you! Your order is active${until}.` }
      : { headline: "Your order is active again", message: `your order is active again${until}.` };
  if (o.payment_status === "paid" && oldPayment !== "paid")
    return { headline: "Payment received", message: "thank you! We received your payment." };
  return { headline: "Order updated", message: "the status of your order changed." };
}

export async function emailValues(row: OutboxRow): Promise<Record<string, string> | null> {
  const d = row.data;
  if (row.template === "order-renewed") {
    const o = await orderNow(d.orderId);
    // only while it's still active (a later change has its own email)
    if (!o || o.status !== "active" || !o.ends_at) return null;
    const ctx = await context(o.app_id);
    if (!ctx) return null;
    const { rows: items } = await query<{ name: string }>("SELECT name FROM order_items WHERE order_id = $1 ORDER BY id", [o.id]);
    // the payment of this renewal, when the provider reported it
    const { rows: paid } = await query<{ amount: number; currency: string }>(
      `SELECT amount AS amount, currency FROM payments
        WHERE order_id = $1 AND status = 'succeeded' AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', $2, '-1 hours')
        ORDER BY created_at DESC LIMIT 1`,
      [o.id, row.created_at],
    );
    return {
      ...ctx,
      name: o.user_name,
      email: row.to_email,
      orderNumber: o.order_number,
      item: items.map((i) => i.name).join(", ") || "your",
      billing: billingText(o.billing, o.interval_unit, o.interval_count),
      until: day(o.ends_at),
      amount: paid[0] ? formatMoney(paid[0].amount, paid[0].currency, "en") : "",
    };
  }
  if (row.template === "order-created" || row.template === "order-updated") {
    const o = await orderNow(d.orderId);
    if (!o) return null; // deleted since
    const ctx = await context(o.app_id);
    if (!ctx) return null;
    const base = { ...ctx, name: o.user_name, email: row.to_email, orderNumber: o.order_number, payUrl: o.pay_url ?? "" };
    if (row.template === "order-updated") {
      const oldPayment = String(d.oldPayment);
      const oldStatus = String(d.oldStatus);
      if (o.payment_status === oldPayment && o.status === oldStatus) return null; // changed back
      return {
        ...base,
        ...orderChange(o, oldPayment, oldStatus),
        paymentStatus: PAYMENT_NAMES[o.payment_status] ?? o.payment_status,
        orderStatus: STATUS_NAMES[o.status] ?? o.status,
        // only unpaid orders show a pay button
        payUrl: o.payment_status === "paid" || o.status === "cancelled" ? "" : (o.pay_url ?? ""),
      };
    }
    const { rows: items } = await query<{ name: string; quantity: number; amount: number }>(
      "SELECT name, quantity, (quantity * unit_amount) AS amount FROM order_items WHERE order_id = $1 ORDER BY id",
      [o.id],
    );
    const money = (v: number) => formatMoney(v, o.currency, "en");
    return {
      ...base,
      billing: billingText(o.billing, o.interval_unit, o.interval_count),
      itemRows: items
        .map(
          (i) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:14px;color:#27272a;">${escapeHtml(i.name)}${
              i.quantity > 1 ? ` × ${i.quantity}` : ""
            }</td><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:14px;color:#27272a;text-align:right;">${escapeHtml(money(i.amount))}</td></tr>`,
        )
        .join(""),
      itemLines: items.map((i) => `- ${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ""}: ${money(i.amount)}`).join("\n"),
      total: money(items.reduce((s, i) => s + i.amount, 0)),
      payUntil: o.pay_url_expires_at ? when(o.pay_url_expires_at) : "",
      payUrl: o.payment_status === "paid" ? "" : (o.pay_url ?? ""),
    };
  }

  const ctx = await context(Number(d.appId));
  if (!ctx) return null;
  const name = await userName(d.appUserId, row.to_email);
  if (row.template === "welcome") return { ...ctx, name, email: row.to_email };
  // device-added / device-removed
  const os = OS_NAMES[String(d.os)] ?? String(d.os);
  return {
    ...ctx,
    name,
    email: row.to_email,
    deviceName: d.model ? `${String(d.model)} (${os})` : os,
    deviceUid: String(d.deviceUid),
    when: when(row.created_at),
  };
}
