// Shared (client + server): what an app sells and to whom. Digital goods only.

export const DEVICE_OS = [
  "android",
  "ios",
  "web",
  "windows",
  "macos",
  "linux",
  "other",
] as const;
export type DeviceOs = (typeof DEVICE_OS)[number];

/**
 * What paying an order gives:
 *   lifetime    one-time payment, never expires
 *   fixed_term  one-time payment, access for `intervalCount` × `intervalUnit`
 *   recurring   renews every `intervalCount` × `intervalUnit`
 */
export const BILLING_TYPES = ["lifetime", "fixed_term", "recurring"] as const;
export type Billing = (typeof BILLING_TYPES)[number];

export const INTERVAL_UNITS = ["day", "week", "month", "year"] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

/** Common durations offered first in the order form ("1 month", "7 days"); anything else is "custom". */
export const PERIOD_PRESETS = [
  { key: "1d", unit: "day", count: 1 },
  { key: "7d", unit: "day", count: 7 },
  { key: "1m", unit: "month", count: 1 },
  { key: "3m", unit: "month", count: 3 },
  { key: "6m", unit: "month", count: 6 },
  { key: "1y", unit: "year", count: 1 },
  { key: "2y", unit: "year", count: 2 },
] as const satisfies readonly {
  key: string;
  unit: IntervalUnit;
  count: number;
}[];

// An order has two statuses, each changed on its own (Change status on the Orders page):

/** Payment: pending → paid / failed; failed → paid / pending; paid → refunded. */
export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_TRANSITIONS: Record<
  PaymentStatus,
  readonly PaymentStatus[]
> = {
  pending: ["paid", "failed"],
  failed: ["paid", "pending"],
  paid: ["refunded"],
  refunded: [],
};

/**
 * Order (access): pending until it starts; active gives access (paid orders only) and
 * becomes expired by itself when its period ends; cancelled stops it. Expired or cancelled
 * orders can be made active again (a new period from now).
 * Paying a pending order starts it; refunding cancels it.
 */
export const ORDER_STATUSES = [
  "pending",
  "active",
  "expired",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["active", "cancelled"],
  active: ["expired", "cancelled"],
  expired: ["active", "cancelled"],
  cancelled: ["active"],
};

export const CURRENCIES = [
  "USDT",
  "USD",
  "EUR",
  "GBP",
  "LKR",
  "INR",
  "AUD",
  "CAD",
  "SGD",
  "JPY",
] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Decimal places of a currency (2 for USDT / USD, 0 for JPY). */
export function currencyDigits(currency: string) {
  if (currency === "USDT") return 2;
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** "12.50" → 1250 (minor units); null when it isn't a valid non-negative amount. */
export function toMinor(value: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const re = digits
    ? new RegExp(`^\\d{1,12}(\\.\\d{1,${digits}})?$`)
    : /^\d{1,12}$/;
  if (!re.test(value.trim())) return null;
  return Math.round(Number(value.trim()) * 10 ** digits);
}

export function formatMoney(minor: number, currency: string, locale = "en") {
  const digits = currencyDigits(currency);
  const amount = minor / 10 ** digits;
  if (currency === "USDT") {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
    return `${formatted} USDT`;
  }
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      amount,
    );
  } catch {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
    return `${formatted} ${currency}`;
  }
}

/** One payment attempt reported by Stripe (Payments page); an order can have several. */
export const PAYMENT_RECORD_STATUSES = [
  "processing",
  "succeeded",
  "failed",
  "refunded",
  "partially_refunded",
] as const;
export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];
