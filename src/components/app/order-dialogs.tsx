"use client";

import { useState } from "react";
import {
  CalendarClock,
  Infinity as InfinityIcon,
  Link2,
  ListChecks,
  Loader2,
  Plus,
  Repeat,
  RotateCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPicker } from "@/components/app/customer-picker";
import { ScopeFields } from "@/components/app/scope";
import {
  OrderStatusCell,
  PaymentBadge,
  paymentLabel,
  statusLabel,
} from "@/components/app/order-status";
import {
  PayLinkDialog,
  usePayLinkAccess,
  type PayLinkOrder,
} from "@/components/app/pay-link";
import { OrderPaymentsList } from "@/components/app/payments";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { billingLabel, periodLabel } from "@/lib/billing-label";
import {
  CURRENCIES,
  INTERVAL_UNITS,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  PERIOD_PRESETS,
  formatMoney,
  toMinor,
  type Billing,
  type Currency,
  type IntervalUnit,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/commerce";
import { formatDateTime, intlLocale } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useCreateOrderMutation,
  useOrderTemplatesQuery,
  useOrderQuery,
  useRenewOrderMutation,
  useSetOrderPaymentMutation,
  useSetOrderStatusMutation,
} from "@/store/api";
import type { Order, OrderDetail } from "@/store/types";

// The Orders page's dialogs, also used under a user's row on the Users page.

const BILLING_UI: {
  billing: Billing;
  icon: typeof Repeat;
  label: TranslationKey;
  hint: TranslationKey;
}[] = [
  {
    billing: "recurring",
    icon: Repeat,
    label: "orders.typeRecurring",
    hint: "orders.typeRecurringHint",
  },
  {
    billing: "fixed_term",
    icon: CalendarClock,
    label: "orders.typeFixed",
    hint: "orders.typeFixedHint",
  },
  {
    billing: "lifetime",
    icon: InfinityIcon,
    label: "orders.typeLifetime",
    hint: "orders.typeLifetimeHint",
  },
];
const CUSTOM = "custom";

type Line = { key: number; name: string; quantity: string; price: string };
const newLine = (): Line => ({
  key: Math.random(),
  name: "",
  quantity: "1",
  price: "",
});
const qtyValid = (q: string) =>
  /^\d+$/.test(q) && Number(q) >= 1 && Number(q) <= 1000;

/** Billing type and period, as chosen in the order form and the order template form. */
export function useBillingPeriod(initial?: { billing: Billing; unit: IntervalUnit | null; count: number | null }) {
  const preset0 = initial?.unit
    ? (PERIOD_PRESETS.find((p) => p.unit === initial.unit && p.count === initial.count)?.key ?? CUSTOM)
    : "1m";
  const [billing, setBilling] = useState<Billing>(initial?.billing ?? "recurring");
  const [preset, setPreset] = useState<string>(preset0);
  const [unit, setUnit] = useState<IntervalUnit>(initial?.unit ?? "month");
  const [count, setCount] = useState(String(initial?.count ?? 1));
  const chosen = PERIOD_PRESETS.find((p) => p.key === preset);
  const period = chosen
    ? { unit: chosen.unit as IntervalUnit, count: chosen.count as number }
    : { unit, count: Number(count) };
  const periodValid =
    billing === "lifetime" || (Number.isInteger(period.count) && period.count >= 1 && period.count <= 365);
  return { billing, setBilling, preset, setPreset, unit, setUnit, count, setCount, period, periodValid };
}

/** The billing type cards and the period picker (subscription: renews every; one-time: access for). */
export function BillingPeriodFields({ state }: { state: ReturnType<typeof useBillingPeriod> }) {
  const t = useT();
  const { billing, setBilling, preset, setPreset, unit, setUnit, count, setCount, period, periodValid } = state;
  const presetItems = [
    // durations ("1 month"): the label above says whether it renews or expires
    ...PERIOD_PRESETS.map((p) => ({ value: p.key as string, label: periodLabel(t, p.unit, p.count) })),
    { value: CUSTOM, label: t("orders.customPeriod") },
  ];
  const unitItems = INTERVAL_UNITS.map((u) => ({ value: u, label: t(`orders.unit.${u}` as TranslationKey) }));
  return (
    <>
            {/* subscription or one-time */}
            <div className="grid gap-2">
              <Label>{t("orders.type")}</Label>
              <div
                className="grid gap-2 sm:grid-cols-3"
                role="radiogroup"
                aria-label={t("orders.type")}
              >
                {BILLING_UI.map(({ billing: b, icon: Icon, label, hint }) => (
                  <button
                    key={b}
                    type="button"
                    role="radio"
                    aria-checked={billing === b}
                    onClick={() => setBilling(b)}
                    className={cn(
                      "grid gap-1 rounded-lg border p-3 text-left transition-colors",
                      billing === b
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="size-4" /> {t(label)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(hint)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {billing !== "lifetime" && (
              <div className="grid gap-2">
                <Label htmlFor="orderPeriod">
                  {t(
                    billing === "recurring"
                      ? "orders.renewsEvery"
                      : "orders.accessFor",
                  )}
                </Label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Select
                    items={presetItems}
                    value={preset}
                    onValueChange={(v) => v && setPreset(v)}
                  >
                    <SelectTrigger id="orderPeriod" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {presetItems.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {preset === CUSTOM && (
                    <>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        className="sm:w-24"
                        aria-label={t("orders.count")}
                        aria-invalid={!periodValid}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                      />
                      <Select
                        items={unitItems}
                        value={unit}
                        onValueChange={(v) => v && setUnit(v as IntervalUnit)}
                      >
                        <SelectTrigger
                          className="w-full sm:w-32"
                          aria-label={t("orders.unitLabel")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {unitItems.map((i) => (
                            <SelectItem key={i.value} value={i.value}>
                              {i.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
                {preset === CUSTOM && periodValid && (
                  <p className="text-xs text-muted-foreground">
                    {periodLabel(t, period.unit, period.count)}
                  </p>
                )}
              </div>
            )}
    </>
  );
}

/**
 * New order. `defaults` pre-fills it — from a user's row: their app and themselves, shown
 * fixed (when `appName` / `userName` are given).
 */
export function NewOrderDialog({
  defaults,
  onClose,
}: {
  defaults?: {
    appId?: number;
    appName?: string;
    userId?: number;
    userName?: string;
  };
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [create, { isLoading }] = useCreateOrderMutation();
  const [appId, setAppId] = useState(defaults?.appId);
  const [userId, setUserId] = useState<number | null>(defaults?.userId ?? null);
  const billingPeriod = useBillingPeriod();
  const { billing, period, periodValid } = billingPeriod;
  const [currency, setCurrency] = useState<Currency>("USD");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [note, setNote] = useState("");
  const [createCheckout, setCreateCheckout] = useState(true);
  // the app's active templates (order creators may list them); null = a custom order
  const { can } = useAccess();
  const canTemplates = can("orderTemplates.list");
  // (the first 25 active templates of the app — one page)
  const { data: templatePage } = useOrderTemplatesQuery(
    { appId, active: "true" },
    { skip: !appId || !canTemplates },
  );
  const templates = templatePage?.items;
  const [templateId, setTemplateId] = useState<number | null>(null);
  const template = templates?.find((tp) => tp.id === templateId) ?? null;
  // after creating: the order's Stripe payment link (or why there is none)
  const [created, setCreated] = useState<{
    order: PayLinkOrder;
    error: string | null;
  } | null>(null);

  const amounts = lines.map((l) => toMinor(l.price, currency));
  const total = lines.reduce(
    (sum, l, i) =>
      sum + (amounts[i] ?? 0) * (qtyValid(l.quantity) ? Number(l.quantity) : 0),
    0,
  );
  const valid =
    !!appId &&
    !!userId &&
    (!!template ||
      (periodValid &&
        lines.every(
          (l, i) => l.name.trim() && qtyValid(l.quantity) && amounts[i] !== null,
        )));

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const currencyItems = CURRENCIES.map((c) => ({ value: c, label: c }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !userId) return;
    const base = {
      appId,
      appUserId: userId,
      currency,
      note,
      createCheckout,
      items: lines.map((l, i) => ({
        name: l.name.trim(),
        quantity: Number(l.quantity),
        unitAmount: amounts[i]!,
      })),
    };
    try {
      const res = await create(
        template
          ? { appId, appUserId: userId, note, createCheckout, templateId: template.id }
          : billing === "lifetime"
          ? { ...base, billing }
          : {
              ...base,
              billing,
              intervalUnit: period.unit,
              intervalCount: period.count,
            },
      ).unwrap();
      toast.success(res.message);
      if (res.checkout || res.checkoutError) {
        setCreated({
          order: {
            id: res.order.id,
            order_number: res.order.order_number,
            payment_status: "pending",
            status: "pending",
            pay_url: res.checkout?.url ?? null,
            pay_url_expires_at: res.checkout?.expiresAt ?? null,
            stripe_subscription_id: null,
            google_product_id: null,
          },
          error: res.checkoutError,
        });
      } else onClose();
    } catch {
      // the API error middleware shows the error
    }
  };

  if (created)
    return (
      <PayLinkDialog
        order={created.order}
        error={created.error}
        onClose={onClose}
      />
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form noValidate onSubmit={submit} className="grid min-w-0 gap-4">
          <DialogHeader>
            <DialogTitle>{t("orders.newTitle")}</DialogTitle>
          </DialogHeader>
          {defaults?.appName ? (
            <ScopeFields appName={defaults.appName} />
          ) : (
            <ScopeFields
              appId={appId}
              onApp={(id) => {
                setAppId(id);
                setUserId(null);
                setTemplateId(null);
              }}
            />
          )}
          <div className="grid gap-2">
            <Label htmlFor="orderUser">{t("orders.customer")}</Label>
            {defaults?.userName ? (
              <Input id="orderUser" value={defaults.userName} disabled />
            ) : (
              <CustomerPicker
                key={appId ?? "none"}
                id="orderUser"
                appId={appId}
                value={userId}
                onChange={setUserId}
              />
            )}
          </div>

          {canTemplates && !!templates?.length && (
            <div className="grid gap-2">
              <Label htmlFor="orderTemplate">{t("templates.template")}</Label>
              <Select
                items={[
                  { value: "custom", label: t("templates.custom") },
                  ...templates.map((tp) => ({
                    value: String(tp.id),
                    label: `${tp.name} · ${formatMoney(tp.unit_amount, tp.currency, intlLocale[locale])}`,
                  })),
                ]}
                value={templateId === null ? "custom" : String(templateId)}
                onValueChange={(v) => v && setTemplateId(v === "custom" ? null : Number(v))}
              >
                <SelectTrigger id="orderTemplate" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">{t("templates.custom")}</SelectItem>
                  {templates.map((tp) => (
                    <SelectItem key={tp.id} value={String(tp.id)}>
                      {tp.name} · {formatMoney(tp.unit_amount, tp.currency, intlLocale[locale])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template && (
                <p className="text-xs text-muted-foreground">
                  {t("templates.fromTemplateHint")} {billingLabel(t, template)}
                </p>
              )}
            </div>
          )}

          {!template && (
            <>
            <BillingPeriodFields state={billingPeriod} />

            {/* items */}
            <div className="grid gap-2">
              <div className="flex items-end justify-between gap-2">
                <Label>{t("orders.items")}</Label>
                <div className="w-28">
                  <Select
                    items={currencyItems}
                    value={currency}
                    onValueChange={(v) => v && setCurrency(v as Currency)}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label={t("orders.currency")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyItems.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="hidden grid-cols-[1fr_4.5rem_7rem_auto] gap-2 text-xs text-muted-foreground sm:grid">
                <span>{t("orders.itemName")}</span>
                <span>{t("orders.quantity")}</span>
                <span>{t("orders.unitPrice")}</span>
                <span className="w-9" />
              </div>
              {lines.map((line, i) => (
                <div
                  key={line.key}
                  className="grid min-w-0 grid-cols-[1fr_4.5rem_7rem_auto] items-center gap-2"
                >
                  <Input
                    aria-label={t("orders.itemName")}
                    maxLength={160}
                    placeholder={t("orders.itemPlaceholder")}
                    value={line.name}
                    onChange={(e) => setLine(line.key, { name: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    aria-label={t("orders.quantity")}
                    aria-invalid={!qtyValid(line.quantity)}
                    value={line.quantity}
                    onChange={(e) =>
                      setLine(line.key, { quantity: e.target.value })
                    }
                  />
                  <Input
                    inputMode="decimal"
                    aria-label={t("orders.unitPrice")}
                    placeholder="9.99"
                    aria-invalid={!!line.price && amounts[i] === null}
                    value={line.price}
                    onChange={(e) => setLine(line.key, { price: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.delete")}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((ls) => ls.filter((l) => l.key !== line.key))
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={lines.length >= 50}
                onClick={() => setLines((ls) => [...ls, newLine()])}
              >
                <Plus /> {t("orders.addItem")}
              </Button>
            </div>
            </>
          )}

          <div className="grid gap-2">
            <Label htmlFor="orderNote">{t("orders.note")}</Label>
            <Textarea
              id="orderNote"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="orderCheckout"
              className="mt-0.5"
              checked={createCheckout}
              onCheckedChange={(v) => setCreateCheckout(v === true)}
            />
            <div className="grid gap-0.5">
              <Label htmlFor="orderCheckout">{t("orders.createCheckoutOption")}</Label>
              <p className="text-xs text-muted-foreground">{t("orders.createCheckoutHint")}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <span>
              {t("orders.total")}
              {(template || periodValid) && (
                <span className="text-muted-foreground">
                  {" · "}
                  {billingLabel(
                    t,
                    template ?? {
                      billing,
                      interval_unit: billing === "lifetime" ? null : period.unit,
                      interval_count: billing === "lifetime" ? null : period.count,
                    },
                  )}
                </span>
              )}
            </span>
            <span className="font-semibold tabular-nums">
              {template
                ? formatMoney(template.unit_amount, template.currency, intlLocale[locale])
                : formatMoney(total, currency, intlLocale[locale])}
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !valid}>
              {isLoading && <Loader2 className="animate-spin" />}
              {t("orders.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Change the payment status and / or the order status. Only allowed changes are offered,
 * each needs its own permission. Paying a pending order starts it; refunding cancels it.
 */
export function StatusDialog({
  order,
  onClose,
}: {
  order: Order | OrderDetail;
  onClose: () => void;
}) {
  const t = useT();
  const { can } = useAccess();
  const [setPayment] = useSetOrderPaymentMutation();
  const [setStatus] = useSetOrderStatusMutation();
  const [payment, setPaymentValue] = useState<PaymentStatus>(
    order.payment_status,
  );
  const [status, setStatusValue] = useState<OrderStatus>(order.status);
  const [saving, setSaving] = useState(false);
  const canPayment = can("orders.updatePayment");
  const canStatus = can("orders.updateOrderStatus");

  // what the payment change does to the order by itself
  const automatic: OrderStatus | null =
    payment === order.payment_status
      ? null
      : payment === "paid" && order.status === "pending"
        ? "active"
        : payment === "refunded"
          ? "cancelled"
          : null;
  const paidAfter = payment === "paid";
  const paymentItems = [
    order.payment_status,
    ...PAYMENT_TRANSITIONS[order.payment_status],
  ].map((s) => ({
    value: s,
    label: t(paymentLabel(s)),
  }));
  const statusItems = [order.status, ...ORDER_TRANSITIONS[order.status]].map(
    (s) => ({
      value: s,
      label: t(statusLabel(s)),
    }),
  );
  const statusChange = automatic
    ? null
    : status !== order.status
      ? status
      : null;
  const activeNeedsPayment = statusChange === "active" && !paidAfter;
  const changed = payment !== order.payment_status || !!statusChange;

  const save = async () => {
    setSaving(true);
    try {
      if (payment !== order.payment_status) {
        toast.success(
          (await setPayment({ id: order.id, status: payment }).unwrap())
            .message,
        );
      }
      if (statusChange)
        toast.success(
          (await setStatus({ id: order.id, status: statusChange }).unwrap())
            .message,
        );
      onClose();
    } catch {
      // the API error middleware shows the error
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <div className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {t("orders.changeStatusTitle", { number: order.order_number })}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="paymentStatus">{t("orders.paymentLabel")}</Label>
            <Select
              items={paymentItems}
              value={payment}
              onValueChange={(v) => v && setPaymentValue(v as PaymentStatus)}
              disabled={!canPayment || paymentItems.length === 1}
            >
              <SelectTrigger
                id="paymentStatus"
                className="w-full"
                title={canPayment ? undefined : t("status.noPermission")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentItems.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="orderStatus">{t("orders.orderStatusLabel")}</Label>
            {automatic ? (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                {t(
                  automatic === "active"
                    ? "orders.autoActive"
                    : "orders.autoCancelled",
                )}
              </p>
            ) : (
              <Select
                items={statusItems}
                value={status}
                onValueChange={(v) => v && setStatusValue(v as OrderStatus)}
                disabled={!canStatus || statusItems.length === 1}
              >
                <SelectTrigger
                  id="orderStatus"
                  className="w-full"
                  title={canStatus ? undefined : t("status.noPermission")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {activeNeedsPayment ? (
              <p className="text-xs text-destructive">
                {t("errors.ORDER_NOT_PAID")}
              </p>
            ) : (
              !automatic && (
                <p className="text-xs text-muted-foreground">
                  {t("orders.statusHint")}
                </p>
              )
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={saving || !changed || activeNeedsPayment}
              onClick={save}
            >
              {saving && <Loader2 className="animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What can be done with an order (by permission and state). */
export function useOrderActions() {
  const { can } = useAccess();
  const [renew, { isLoading: renewing }] = useRenewOrderMutation();
  const canChangeStatus =
    can("orders.updatePayment") || can("orders.updateOrderStatus");
  const { hasPayLink } = usePayLinkAccess();
  // Stripe renews its own subscriptions
  const renewable = (
    o: Pick<
      Order,
      | "status"
      | "billing"
      | "payment_status"
      | "stripe_subscription_id"
      | "google_product_id"
    >,
  ) =>
    can("orders.renew") &&
    o.billing === "recurring" &&
    !o.stripe_subscription_id &&
    !o.google_product_id &&
    o.payment_status === "paid" &&
    (o.status === "active" || o.status === "expired");
  const runRenew = async (id: number) => {
    try {
      toast.success((await renew({ id }).unwrap()).message);
    } catch {
      // the API error middleware shows the error
    }
  };
  return { canChangeStatus, renewable, runRenew, renewing, hasPayLink };
}

export function OrderDialog({
  id,
  onClose,
  onChangeStatus,
}: {
  id: number;
  onClose: () => void;
  onChangeStatus: (o: OrderDetail) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { data: order, isLoading } = useOrderQuery({ id });
  const { canChangeStatus, renewable, runRenew, renewing, hasPayLink } =
    useOrderActions();
  const [payLink, setPayLink] = useState(false);
  const money = (minor: number) =>
    order ? formatMoney(minor, order.currency, intlLocale[locale]) : "";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <div className="grid min-w-0 gap-4">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{order?.order_number ?? "…"}</span>
            </DialogTitle>
            <DialogDescription>
              {order
                ? `${order.user_name}${order.user_email ? ` · ${order.user_email}` : ""} · ${order.app_name}`
                : " "}
            </DialogDescription>
          </DialogHeader>
          {isLoading && <Skeleton className="h-40" />}
          {order && (
            <>
              <div className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-3">
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t("orders.type")}
                  </span>
                  <span className="font-medium">{billingLabel(t, order)}</span>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t("orders.paymentLabel")}
                  </span>
                  <PaymentBadge status={order.payment_status} />
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t("orders.orderStatusLabel")}
                  </span>
                  <OrderStatusCell order={order} />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("orders.itemName")}</TableHead>
                    <TableHead className="text-right">
                      {t("orders.quantity")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("orders.unitPrice")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("orders.amount")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(i.unit_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(i.unit_amount * i.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="grid gap-1 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>{t("orders.total")}</span>
                  <span className="tabular-nums">{money(order.total)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("orders.created")}</span>
                  <span>{formatDateTime(order.created_at, locale, "—")}</span>
                </div>
                {order.paid_at && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("orders.paidAt")}</span>
                    <span>{formatDateTime(order.paid_at, locale, "—")}</span>
                  </div>
                )}
                {order.note && (
                  <p className="rounded-lg bg-muted/60 p-2 text-muted-foreground">
                    {order.note}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {t("orders.paymentsTitle")}
                  </h3>
                  {order.stripe_subscription_id && (
                    <span
                      className="text-xs text-muted-foreground"
                      title={t("orders.stripeBilledHint")}
                    >
                      {t("orders.stripeBilled")}
                    </span>
                  )}
                  {order.google_product_id && (
                    <span
                      className="text-xs text-muted-foreground"
                      title={t("orders.googleBilledHint")}
                    >
                      {t("orders.googleBilled")} · {order.google_product_id}
                    </span>
                  )}
                </div>
                <OrderPaymentsList payments={order.payments} />
              </div>
            </>
          )}
          <DialogFooter>
            {order && hasPayLink(order) && (
              <Button variant="outline" onClick={() => setPayLink(true)}>
                <Link2 /> {t("orders.payLink")}
              </Button>
            )}
            {order && renewable(order) && (
              <Button
                variant="outline"
                disabled={renewing}
                onClick={() => runRenew(order.id)}
              >
                <RotateCw /> {t("orders.renew")}
              </Button>
            )}
            {order && canChangeStatus && (
              <Button onClick={() => onChangeStatus(order)}>
                <ListChecks /> {t("orders.changeStatus")}
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </div>
        {order && payLink && (
          <PayLinkDialog order={order} onClose={() => setPayLink(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
