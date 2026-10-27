"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Layers,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSelect, useScope } from "@/components/app/scope";
import {
  BillingDistributionBar,
  CurrencyBreakdownCard,
  DeviceOsList,
  ExpiringSoonNotice,
  RevenueAreaChart,
  StatusDonutChart,
} from "@/components/app/dashboard-charts";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import { formatMoney } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import { formatDateTime, intlLocale } from "@/lib/format";
import { isSuperAdminUser, roleLabel } from "@/lib/role-label";
import {
  useDashboardStatsQuery,
  useMeQuery,
  useUsersQuery,
} from "@/store/api";

const TIME_RANGES = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
] as const;

export default function DashboardHomePage() {
  const t = useT();
  const { locale } = useLocale();
  const scope = useScope();
  const { can } = useAccess();
  const canViewManagers = can("managers.list");

  // Amounts aren't converted between currencies: the page shows one at a time. Until one is
  // picked, the server uses the currency that earned the most in the period.
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>();
  const [selectedRange, setSelectedRange] = useState<string>("30d");

  const { data: me, isLoading: loadingMe } = useMeQuery();
  const { data: users } = useUsersQuery(undefined, { skip: !canViewManagers });
  const managers = users?.filter((u) => !isSuperAdminUser(u)) ?? [];

  const {
    data: stats,
    isLoading: loadingStats,
  } = useDashboardStatsQuery(
    {
      appId: scope.appId,
      currency: selectedCurrency,
      range: selectedRange,
    },
    { skip: !scope.platformId },
  );

  if (loadingMe || !me) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const kpi = stats?.kpi;
  const currency = selectedCurrency ?? stats?.currency ?? "USDT";
  const isPositiveGrowth = (kpi?.growthPercent ?? 0) >= 0;

  // Order status distribution items for Donut
  const orderStatuses = stats
    ? [
        {
          label: "Active",
          count: stats.orderStatuses.active,
          color: "#10b981",
          icon: CheckCircle2,
        },
        {
          label: "Pending",
          count: stats.orderStatuses.pending,
          color: "#f59e0b",
          icon: Clock,
        },
        {
          label: "Expired",
          count: stats.orderStatuses.expired,
          color: "#94a3b8",
          icon: RotateCcw,
        },
        {
          label: "Cancelled",
          count: stats.orderStatuses.cancelled,
          color: "#ef4444",
          icon: ShieldAlert,
        },
      ]
    : [];

  return (
    <div className="grid gap-6">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("dashboard.welcome", { name: me.full_name || me.username })}
          </h2>
          <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>

        {/* Global Controls: App filter & Date Range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <AppSelect value={scope.appId} onChange={scope.setAppId} allowAll />
          </div>

          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setSelectedRange(r.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  selectedRange === r.value
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Currency switch: amounts are per currency, never converted */}
      {!!stats?.availableCurrencies.length && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Coins className="size-3.5" />
            <span>Currency</span>
          </div>
          <div className="flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
            {stats.availableCurrencies.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCurrency(c)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-all",
                  currency === c
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            Amounts aren&apos;t converted — each currency is totalled on its own.
          </span>
        </div>
      )}

      {/* Row 1: Top KPI Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          tone="emerald"
          icon={TrendingUp}
          label={`Gross Revenue (${currency})`}
          loading={loadingStats}
          value={formatMoney(kpi?.revenue ?? 0, currency, intlLocale[locale])}
        >
          {isPositiveGrowth ? (
            <span className="inline-flex items-center font-medium text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="size-3.5" />+{kpi?.growthPercent}%
            </span>
          ) : (
            <span className="inline-flex items-center font-medium text-rose-600 dark:text-rose-400">
              <ArrowDownRight className="size-3.5" />
              {kpi?.growthPercent}%
            </span>
          )}
          <span>vs previous period</span>
        </KpiCard>

        <KpiCard tone="sky" icon={ShoppingBag} label="Total Orders" loading={loadingStats} value={kpi?.totalOrders ?? 0}>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{kpi?.paidOrders ?? 0} paid</span>
          <span>·</span>
          <span>{kpi?.conversionRate}% success rate</span>
        </KpiCard>

        <KpiCard
          tone="violet"
          icon={Layers}
          label="Active Access & Licenses"
          loading={loadingStats}
          value={(kpi?.activeSubscriptions ?? 0) + (kpi?.lifetimeLicenses ?? 0) + (kpi?.activeFixedTerm ?? 0)}
        >
          {kpi?.activeSubscriptions} recurring · {kpi?.lifetimeLicenses} lifetime
        </KpiCard>

        <KpiCard
          tone="amber"
          icon={UsersRound}
          label="Customers & Devices"
          loading={loadingStats}
          value={kpi?.activeUsers ?? 0}
        >
          <Smartphone className="size-3.5" />
          <span>{kpi?.activeDevices ?? 0} registered devices</span>
        </KpiCard>
      </div>

      {/* Row 2: Charts Grid (Revenue Curve + Status Distribution Donut) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Trend Area Chart (spans 2 cols) */}
        <Card className={cn(PANEL, "lg:col-span-2")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
              <CardDescription className="text-xs">
                Total earnings recorded in {currency} over {selectedRange}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {currency}
            </Badge>
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <RevenueAreaChart
                timeSeries={stats?.timeSeries ?? []}
                currency={currency}
              />
            )}
          </CardContent>
        </Card>

        {/* Order Status Distribution Donut Chart */}
        <Card className={PANEL}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Order Status Breakdown</CardTitle>
            <CardDescription className="text-xs">Distribution of all order states</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {loadingStats ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <StatusDonutChart
                statuses={orderStatuses}
                total={stats?.kpi.totalOrders ?? 0}
                label="Orders"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Multi-Currency Breakdown, Billing Models, and Device OS */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Multi-Currency Volume Breakdown */}
        <Card className={PANEL}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Multi-Currency Summary</CardTitle>
              <IconChip icon={Coins} tone="emerald" />
            </div>
            <CardDescription className="text-xs">
              Revenue totals grouped by individual currency
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {loadingStats ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <CurrencyBreakdownCard
                summaries={stats?.currencySummaries ?? []}
                activeCurrency={currency}
                onSelectCurrency={setSelectedCurrency}
              />
            )}
          </CardContent>
        </Card>

        {/* Billing Types (Recurring vs Lifetime vs Fixed) */}
        <Card className={PANEL}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Billing Models</CardTitle>
              <IconChip icon={CreditCard} tone="sky" />
            </div>
            <CardDescription className="text-xs">
              Subscription renewals vs one-time licenses
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {loadingStats ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <BillingDistributionBar
                lifetime={stats?.billingBreakdown.lifetime ?? 0}
                fixedTerm={stats?.billingBreakdown.fixed_term ?? 0}
                recurring={stats?.billingBreakdown.recurring ?? 0}
              />
            )}
          </CardContent>
        </Card>

        {/* Device Operating Systems */}
        <Card className={cn(PANEL, "md:col-span-2 lg:col-span-1")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Registered Devices by OS</CardTitle>
              <IconChip icon={Smartphone} tone="violet" />
            </div>
            <CardDescription className="text-xs">Hardware platform distribution</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {loadingStats ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <DeviceOsList items={stats?.deviceOs ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Recent Orders, Expiring Subscriptions & System Health */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Orders Table (spans 2 cols) */}
        <Card className={cn(PANEL, "lg:col-span-2")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Recent Orders</CardTitle>
              <CardDescription className="text-xs">Latest customer purchase activity</CardDescription>
            </div>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/orders" />}>
              View all orders <ArrowUpRight className="ml-1 size-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-44 w-full" />
            ) : !stats?.recentOrders.length ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No orders placed yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 font-medium">Order #</th>
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium">App</th>
                      <th className="pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {stats.recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="py-2.5 font-mono font-medium">
                          <Link href={`/orders`} className="hover:underline">
                            {o.order_number}
                          </Link>
                        </td>
                        <td className="py-2.5 font-medium">{o.user_name}</td>
                        <td className="py-2.5 text-muted-foreground">{o.app_name}</td>
                        <td className="py-2.5 font-semibold">
                          {formatMoney(o.total, o.currency, intlLocale[locale])}
                        </td>
                        <td className="py-2.5">
                          <Badge
                            variant={
                              o.status === "active"
                                ? "default"
                                : o.payment_status === "paid"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="capitalize"
                          >
                            {o.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring Soon Notice & Quick Security / Account Summary */}
        <div className="grid gap-6">
          {/* Expiring Soon */}
          <Card className={PANEL}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Expiring Subscriptions</CardTitle>
                <IconChip icon={Clock} tone="amber" />
              </div>
              <CardDescription className="text-xs">Ending within the next 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-28 w-full" />
              ) : (
                <ExpiringSoonNotice items={stats?.expiringSoon ?? []} />
              )}
            </CardContent>
          </Card>

          {/* Account Profile & Security Overview */}
          <Card className={PANEL}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">{t("dashboard.securityTitle")}</CardTitle>
              <CardDescription className="text-xs">{t("dashboard.securityText")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("dashboard.role")}:</span>
                <span className="font-semibold">{roleLabel(t, me)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("dashboard.lastLogin")}:</span>
                <span className="font-medium">
                  {formatDateTime(me.last_login_at, locale, t("common.never"))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/profile" />}
                >
                  {t("profile.changePassword")}
                </Button>
                {canViewManagers && (
                  <Button
                    variant="secondary"
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/managers" />}
                  >
                    {t("dashboard.manageManagers")} ({managers.length})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Dashboard panels: a soft top-to-bottom tint and a light shadow instead of a flat card. */
const PANEL = "bg-linear-to-b from-muted/50 to-card shadow-sm";

const TONES = {
  emerald: {
    card: "from-emerald-500/12 ring-emerald-500/20",
    glow: "bg-emerald-500/25",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  sky: {
    card: "from-sky-500/12 ring-sky-500/20",
    glow: "bg-sky-500/25",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  violet: {
    card: "from-violet-500/12 ring-violet-500/20",
    glow: "bg-violet-500/25",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  amber: {
    card: "from-amber-500/12 ring-amber-500/20",
    glow: "bg-amber-500/25",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
} as const;
type Tone = keyof typeof TONES;

function IconChip({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONES[tone].chip)}>
      <Icon className="size-4" />
    </span>
  );
}

/** A headline number on a tinted card with a soft glow in the corner. */
function KpiCard({
  tone,
  icon,
  label,
  loading,
  value,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  loading: boolean;
  value: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("relative bg-linear-to-br via-card to-card shadow-sm", TONES[tone].card)}>
      <div
        aria-hidden
        className={cn("pointer-events-none absolute -top-12 -right-12 size-36 rounded-full blur-3xl", TONES[tone].glow)}
      />
      <CardHeader className="relative flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-xs font-medium tracking-wider uppercase">{label}</CardDescription>
        <IconChip icon={icon} tone={tone} />
      </CardHeader>
      <CardContent className="relative">
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{children}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
