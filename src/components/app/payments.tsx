"use client";

import { CreditCard, ExternalLink, Wallet } from "lucide-react";
import { ToneBadge, type Tone } from "@/components/app/tone-badge";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { formatMoney, type PaymentRecordStatus } from "@/lib/commerce";
import { formatDateTime, intlLocale } from "@/lib/format";
import type { OrderPayment } from "@/store/types";

// Payments Stripe reported: on the Payments page and in an order's details.

const TONE: Record<PaymentRecordStatus, Tone> = {
  processing: "amber",
  succeeded: "green",
  failed: "red",
  refunded: "muted",
  partially_refunded: "amber",
};

export const paymentRecordLabel = (s: PaymentRecordStatus) =>
  `payments.status.${s}` as TranslationKey;

export function PaymentRecordBadge({
  status,
}: {
  status: PaymentRecordStatus;
}) {
  const t = useT();
  return (
    <ToneBadge tone={TONE[status]}>{t(paymentRecordLabel(status))}</ToneBadge>
  );
}

/** Stripe's names for payment methods, brands and wallets (shown as is, not translated). */
const NAMES: Record<string, string> = {
  card: "Card",
  amex: "American Express",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  samsung_pay: "Samsung Pay",
  link: "Link",
  us_bank_account: "US bank account",
  sepa_debit: "SEPA Direct Debit",
  bacs_debit: "Bacs Direct Debit",
  au_becs_debit: "BECS Direct Debit",
  acss_debit: "Pre-authorized debit",
  cashapp: "Cash App Pay",
  wechat_pay: "WeChat Pay",
  paypal: "PayPal",
  ideal: "iDEAL",
  afterpay_clearpay: "Afterpay / Clearpay",
  customer_balance: "Bank transfer",
  google_play: "Google Play",
};
const nameOf = (s: string) =>
  NAMES[s] ??
  s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** "Visa •••• 4242", "Klarna", "Link"; then a line of details: "Apple Pay · 04/28 · debit · US". */
export function methodText(
  p: Pick<OrderPayment, "method_type" | "method_details">,
) {
  if (!p.method_type) return null;
  const d = p.method_details ?? {};
  const name = nameOf(
    p.method_type === "card" && d.brand ? d.brand : p.method_type,
  );
  const main = d.last4 ? `${name} •••• ${d.last4}` : name;
  const extra = [
    d.wallet && nameOf(d.wallet),
    d.exp,
    d.funding,
    d.bank_name ?? d.bank,
    d.email ?? d.payer_email,
    d.verified_name,
    d.country,
  ].filter(Boolean);
  return { main, extra: extra.join(" · ") };
}

export function PaymentMethod({
  payment,
}: {
  payment: Pick<OrderPayment, "method_type" | "method_details">;
}) {
  const text = methodText(payment);
  if (!text) return <span className="text-muted-foreground">—</span>;
  const Icon = payment.method_type === "card" ? CreditCard : Wallet;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="grid min-w-0">
        <span className="truncate">{text.main}</span>
        {text.extra && (
          <span className="truncate text-xs text-muted-foreground">
            {text.extra}
          </span>
        )}
      </div>
    </div>
  );
}

/** Amount, and what was refunded of it. */
export function PaymentAmount({
  payment,
}: {
  payment: Pick<OrderPayment, "amount" | "amount_refunded" | "currency">;
}) {
  const t = useT();
  const { locale } = useLocale();
  const money = (v: number) =>
    formatMoney(v, payment.currency, intlLocale[locale]);
  return (
    <div className="grid justify-items-end">
      <span className="font-medium tabular-nums">{money(payment.amount)}</span>
      {payment.amount_refunded > 0 && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {t("payments.refundedAmount", {
            amount: money(payment.amount_refunded),
          })}
        </span>
      )}
    </div>
  );
}

export function ReceiptLink({ url }: { url: string | null }) {
  const t = useT();
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-primary hover:underline"
    >
      {t("payments.receipt")} <ExternalLink className="size-3" />
    </a>
  );
}

/** An order's payments, newest first (order details). */
export function OrderPaymentsList({ payments }: { payments: OrderPayment[] }) {
  const t = useT();
  const { locale } = useLocale();
  if (!payments.length)
    return (
      <p className="text-sm text-muted-foreground">{t("orders.noPayments")}</p>
    );
  return (
    <ul className="grid divide-y rounded-lg border text-sm">
      {payments.map((p) => (
        <li
          key={p.id}
          className="grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4"
        >
          <div className="grid min-w-0 gap-1">
            <PaymentMethod payment={p} />
            <span className="text-xs text-muted-foreground">
              {t(`payments.kind.${p.kind}` as TranslationKey)} ·{" "}
              {formatDateTime(p.paid_at ?? p.created_at, locale, "—")}
              {!p.livemode && ` · ${t("payments.testMode")}`}
            </span>
            {p.status === "failed" && p.failure_message && (
              <span className="text-xs text-destructive">
                {p.failure_message}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <PaymentRecordBadge status={p.status} />
            <ReceiptLink url={p.receipt_url} />
          </div>
          <PaymentAmount payment={p} />
        </li>
      ))}
    </ul>
  );
}
