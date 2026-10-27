"use client";

import { ToneBadge, type Tone } from "@/components/app/tone-badge";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import type { OrderStatus, PaymentStatus } from "@/lib/commerce";
import { formatDateTime } from "@/lib/format";
import type { Order } from "@/store/types";

// An order's two statuses as shown on the Orders page and under a user.

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  pending: "amber",
  paid: "green",
  failed: "red",
  refunded: "muted",
};
const STATUS_TONE: Record<OrderStatus, Tone> = {
  pending: "amber",
  active: "green",
  expired: "muted",
  cancelled: "muted",
};

export const paymentLabel = (s: PaymentStatus) =>
  `orders.payment.${s}` as TranslationKey;
export const statusLabel = (s: OrderStatus) =>
  `orders.status.${s}` as TranslationKey;

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const t = useT();
  return (
    <ToneBadge tone={PAYMENT_TONE[status]}>{t(paymentLabel(status))}</ToneBadge>
  );
}

/** Order status with its period: "Active · renews 26 Nov", "Active · never expires", "Expired · ended …". */
export function OrderStatusCell({
  order,
}: {
  order: Pick<Order, "status" | "billing" | "ends_at">;
}) {
  const t = useT();
  const { locale } = useLocale();
  const date = order.ends_at ? formatDateTime(order.ends_at, locale, "") : "";
  const detail =
    order.status === "active"
      ? order.ends_at
        ? t(
            order.billing === "recurring" ? "orders.renewsOn" : "orders.until",
            { date },
          )
        : t("orders.forever")
      : order.status === "expired" ||
          (order.status === "cancelled" && order.ends_at)
        ? t("orders.endedOn", { date })
        : null;
  return (
    <div className="grid gap-0.5">
      <ToneBadge tone={STATUS_TONE[order.status]}>
        {t(statusLabel(order.status))}
      </ToneBadge>
      {detail && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {detail}
        </span>
      )}
    </div>
  );
}
