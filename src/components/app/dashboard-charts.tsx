"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  Smartphone,
  Monitor,
  Globe,
  Laptop,
  HelpCircle,
  Coins,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/i18n";
import { formatMoney } from "@/lib/commerce";
import { formatDateTime, intlLocale } from "@/lib/format";
import type {
  CurrencyRevenueSummary,
  DeviceOsItem,
  ExpiringOrderSummary,
  RevenueTimeSeriesPoint,
} from "@/store/types";

// --- Helper: OS Icon ---
export function OsIcon({ os, className = "size-4" }: { os: string; className?: string }) {
  const o = os.toLowerCase();
  if (o === "android" || o === "ios") return <Smartphone className={className} />;
  if (o === "windows") return <Monitor className={className} />;
  if (o === "macos" || o === "linux") return <Laptop className={className} />;
  if (o === "web") return <Globe className={className} />;
  return <HelpCircle className={className} />;
}

// --- Area / Line Chart for Revenue over Time ---
export function RevenueAreaChart({
  timeSeries,
  currency,
}: {
  timeSeries: RevenueTimeSeriesPoint[];
  currency: string;
}) {
  const { locale } = useLocale();
  const gradId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!timeSeries.length) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
        <Coins className="mb-2 size-8 stroke-1 text-muted-foreground/60" />
        <p className="text-sm">No revenue recorded in this period for {currency}</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...timeSeries.map((d) => d.revenue), 100);
  const minRevenue = 0;
  const width = 800;
  const height = 240;
  const paddingX = 40;
  const paddingY = 24;

  const points = timeSeries.map((pt, i) => {
    const x =
      timeSeries.length === 1
        ? width / 2
        : paddingX + (i / (timeSeries.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((pt.revenue - minRevenue) / (maxRevenue - minRevenue)) * (height - paddingY * 2);
    return { x, y, pt };
  });

  // SVG curved path using cubic beziers
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) / 2;
    const cp1y = p0.y;
    const cp2x = p0.x + (p1.x - p0.x) / 2;
    const cp2y = p1.y;
    pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative w-full">
      {/* Tooltip */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md transition-all"
          style={{
            left: `${(hovered.x / width) * 100}%`,
            top: `${(hovered.y / height) * 100}%`,
          }}
        >
          <div className="font-semibold">{formatMoney(hovered.pt.revenue, currency, intlLocale[locale])}</div>
          <div className="text-[11px] text-muted-foreground">
            {hovered.pt.date} · {hovered.pt.orders} {hovered.pt.orders === 1 ? "order" : "orders"}
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full overflow-visible"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = height - paddingY - pct * (height - paddingY * 2);
          const val = minRevenue + pct * (maxRevenue - minRevenue);
          return (
            <g key={pct}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeDasharray="4 4"
              />
              <text
                x={paddingX - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {formatMoney(val, currency, intlLocale[locale])}
              </text>
            </g>
          );
        })}

        {/* Shaded Area */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Outline Line */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points & Hover Target */}
        {points.map((p, idx) => (
          <g key={idx} onMouseEnter={() => setHoverIndex(idx)}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hoverIndex === idx ? 5 : 3}
              fill="var(--background)"
              stroke="var(--primary)"
              strokeWidth={hoverIndex === idx ? 2.5 : 2}
              className="transition-all"
            />
            {/* Invisible larger hover hitbox */}
            <rect
              x={p.x - 16}
              y={0}
              width={32}
              height={height}
              fill="transparent"
              className="cursor-pointer"
            />
          </g>
        ))}

        {/* X-axis labels (First, Middle, Last) */}
        {points.length > 0 && (
          <>
            <text
              x={points[0].x}
              y={height - 6}
              textAnchor="start"
              className="fill-muted-foreground text-[10px]"
            >
              {points[0].pt.date}
            </text>
            {points.length > 2 && (
              <text
                x={points[Math.floor(points.length / 2)].x}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {points[Math.floor(points.length / 2)].pt.date}
              </text>
            )}
            <text
              x={points[points.length - 1].x}
              y={height - 6}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {points[points.length - 1].pt.date}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// --- Donut Chart for Statuses ---
export function StatusDonutChart({
  statuses,
  total,
  label = "Total Orders",
}: {
  statuses: {
    label: string;
    count: number;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
  total: number;
  label?: string;
}) {
  const size = 180;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="relative flex shrink-0 items-center justify-center">
        <svg width={size} height={size} className="-rotate-90 transform overflow-visible">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth={strokeWidth}
          />
          {total > 0 &&
            statuses.map((item, i) => {
              const pct = item.count / total;
              if (pct <= 0) return null;
              const strokeDasharray = `${pct * circumference} ${circumference}`;
              const strokeDashoffset = -accumulatedPercent * circumference;
              accumulatedPercent += pct;

              return (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500 ease-out"
                />
              );
            })}
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight">{total}</span>
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid w-full flex-1 gap-2">
        {statuses.map((item, i) => {
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{item.count}</span>
                <span className="w-8 text-right text-muted-foreground">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Billing Types Segment Bar ---
export function BillingDistributionBar({
  lifetime,
  fixedTerm,
  recurring,
}: {
  lifetime: number;
  fixedTerm: number;
  recurring: number;
}) {
  const total = lifetime + fixedTerm + recurring;
  const pLifetime = total > 0 ? Math.round((lifetime / total) * 100) : 0;
  const pFixed = total > 0 ? Math.round((fixedTerm / total) * 100) : 0;
  const pRecurring = total > 0 ? Math.max(0, 100 - pLifetime - pFixed) : 0;

  return (
    <div className="grid gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {pRecurring > 0 && (
          <div
            style={{ width: `${pRecurring}%` }}
            className="bg-emerald-500 transition-all"
            title={`Recurring: ${recurring} (${pRecurring}%)`}
          />
        )}
        {pFixed > 0 && (
          <div
            style={{ width: `${pFixed}%` }}
            className="bg-sky-500 transition-all"
            title={`Fixed Term: ${fixedTerm} (${pFixed}%)`}
          />
        )}
        {pLifetime > 0 && (
          <div
            style={{ width: `${pLifetime}%` }}
            className="bg-violet-500 transition-all"
            title={`Lifetime: ${lifetime} (${pLifetime}%)`}
          />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" />
          <div>
            <div className="font-medium">Recurring</div>
            <div className="text-muted-foreground">{recurring} ({pRecurring}%)</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-500" />
          <div>
            <div className="font-medium">Fixed-Term</div>
            <div className="text-muted-foreground">{fixedTerm} ({pFixed}%)</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-violet-500" />
          <div>
            <div className="font-medium">Lifetime</div>
            <div className="text-muted-foreground">{lifetime} ({pLifetime}%)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Device OS Distribution Bars ---
export function DeviceOsList({ items }: { items: DeviceOsItem[] }) {
  const total = items.reduce((acc, it) => acc + it.count, 0);

  if (!items.length) {
    return <div className="text-xs text-muted-foreground">No devices registered yet</div>;
  }

  return (
    <div className="grid gap-2.5">
      {items.map((it) => {
        const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
        return (
          <div key={it.os} className="grid gap-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-medium capitalize">
                <OsIcon os={it.os} className="size-3.5 text-muted-foreground" />
                <span>{it.os}</span>
              </div>
              <span className="text-muted-foreground">
                {it.count} ({pct}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Multi-Currency Breakdown Card ---
export function CurrencyBreakdownCard({
  summaries,
  activeCurrency,
  onSelectCurrency,
}: {
  summaries: CurrencyRevenueSummary[];
  activeCurrency: string;
  onSelectCurrency: (c: string) => void;
}) {
  const { locale } = useLocale();

  if (!summaries.length) {
    return (
      <div className="py-2 text-xs text-muted-foreground">
        No orders with revenue recorded yet.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {summaries.map((s) => {
        const isSelected = s.currency === activeCurrency;
        return (
          <button
            key={s.currency}
            type="button"
            onClick={() => onSelectCurrency(s.currency)}
            className={`flex w-full items-center justify-between rounded-lg border p-2.5 text-left transition-all ${
              isSelected
                ? "border-primary bg-primary/5 shadow-xs"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <Badge variant={isSelected ? "default" : "secondary"}>
                {s.currency}
              </Badge>
              <div className="text-xs text-muted-foreground">
                {s.ordersCount} {s.ordersCount === 1 ? "order" : "orders"}
              </div>
            </div>
            <div className="font-semibold text-foreground">
              {formatMoney(s.total, s.currency, intlLocale[locale])}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// --- Expiring Subscriptions List ---
export function ExpiringSoonNotice({ items }: { items: ExpiringOrderSummary[] }) {
  const { locale } = useLocale();

  if (!items.length) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
        No subscriptions expiring in the next 7 days.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs dark:bg-amber-500/10"
        >
          <div className="grid gap-0.5">
            <div className="font-medium text-foreground">
              {item.user_name} · <span className="font-mono text-muted-foreground">{item.order_number}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              <Clock className="size-3" />
              <span>Ends {formatDateTime(item.ends_at, locale, "—")}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold">{formatMoney(item.total, item.currency, intlLocale[locale])}</div>
            <Link
              href={`/orders?appUserId=${item.id}`}
              className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
            >
              Manage <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
