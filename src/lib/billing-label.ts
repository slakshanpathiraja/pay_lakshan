import type { TFunction } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import type { Billing, IntervalUnit } from "@/lib/commerce";

/** "1 month", "3 months" */
export function periodLabel(t: TFunction, unit: IntervalUnit, count: number) {
  return t(`billing.${unit}${count === 1 ? "" : "s"}` as TranslationKey, {
    count,
  });
}

/** "Subscription · 1 month", "One-time · 7 days", "One-time · lifetime" */
export function billingLabel(
  t: TFunction,
  order: {
    billing: Billing;
    interval_unit: IntervalUnit | null;
    interval_count: number | null;
  },
) {
  const { billing, interval_unit: unit, interval_count: count } = order;
  if (billing === "lifetime" || !unit || !count) return t("billing.lifetime");
  const period = periodLabel(t, unit, count);
  return t(
    billing === "fixed_term" ? "billing.fixedTerm" : "billing.recurring",
    { period },
  );
}
