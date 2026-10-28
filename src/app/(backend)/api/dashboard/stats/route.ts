import { route } from "@/server/api/route";
import { ORDER_STATE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import type { Billing, OrderStatus, PaymentStatus } from "@/lib/commerce";

export const GET = route("dashboard.stats", async ({ scope, query: q }) => {
  const platformId = scope.platformId;
  const appId = scope.appId ?? null;
  const range = q.range || "30d";

  // Compute time intervals based on range
  let intervalSql = "interval '30 days'";
  let prevIntervalSql = "interval '60 days'";
  if (range === "7d") {
    intervalSql = "interval '7 days'";
    prevIntervalSql = "interval '14 days'";
  } else if (range === "90d") {
    intervalSql = "interval '90 days'";
    prevIntervalSql = "interval '180 days'";
  } else if (range === "1y") {
    intervalSql = "interval '1 year'";
    prevIntervalSql = "interval '2 years'";
  }

  const isAll = range === "all";

  // The database is a network hop away: the queries run in two parallel rounds — those that
  // don't depend on the currency first, then the ones for the chosen currency.
  const dateFormat = range === "1y" ? "YYYY-MM" : "YYYY-MM-DD";
  const [
    { rows: currRows },
    { rows: currencySummaries },
    { rows: failedRows },
    { rows: orderCountRows },
    { rows: statusRows },
    { rows: subRows },
    { rows: userDevRows },
    { rows: billingRows },
    { rows: osRows },
    { rows: recentOrders },
    { rows: expiringSoon },
  ] = await Promise.all([
    query<{ currency: string }>(
      `SELECT DISTINCT currency FROM orders WHERE platform_id = $1 AND ($2::int IS NULL OR app_id = $2)`,
      [platformId, appId],
    ),
    query<{
      currency: string;
      total: number;
      orders_count: number;
    }>(
      `SELECT o.currency,
              COALESCE(SUM(i.quantity * i.unit_amount), 0)::float8 AS total,
              COUNT(DISTINCT o.id)::int AS orders_count
         FROM orders o
         JOIN order_items i ON i.order_id = o.id
        WHERE o.platform_id = $1
          AND ($2::int IS NULL OR o.app_id = $2)
          AND o.payment_status = 'paid'
          ${isAll ? "" : `AND o.created_at >= (now() - ${intervalSql})`}
        GROUP BY o.currency
        ORDER BY total DESC`,
      [platformId, appId],
    ),
    query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM payments
        WHERE platform_id = $1
          AND ($2::int IS NULL OR app_id = $2)
          AND status = 'failed'
          ${isAll ? "" : `AND created_at >= (now() - ${intervalSql})`}`,
      [platformId, appId],
    ),
    query<{
      total_orders: number;
      paid_orders: number;
      pending_orders: number;
      failed_orders: number;
      refunded_orders: number;
    }>(
      `SELECT count(*)::int AS total_orders,
              count(*) FILTER (WHERE payment_status = 'paid')::int AS paid_orders,
              count(*) FILTER (WHERE payment_status = 'pending')::int AS pending_orders,
              count(*) FILTER (WHERE payment_status = 'failed')::int AS failed_orders,
              count(*) FILTER (WHERE payment_status = 'refunded')::int AS refunded_orders
         FROM orders
        WHERE platform_id = $1
          AND ($2::int IS NULL OR app_id = $2)
          ${isAll ? "" : `AND created_at >= (now() - ${intervalSql})`}`,
      [platformId, appId],
    ),
    query<{
      active: number;
      pending: number;
      expired: number;
      cancelled: number;
    }>(
      `SELECT count(*) FILTER (WHERE ${ORDER_STATE} = 'active')::int AS active,
              count(*) FILTER (WHERE ${ORDER_STATE} = 'pending')::int AS pending,
              count(*) FILTER (WHERE ${ORDER_STATE} = 'expired')::int AS expired,
              count(*) FILTER (WHERE ${ORDER_STATE} = 'cancelled')::int AS cancelled
         FROM orders o
        WHERE o.platform_id = $1
          AND ($2::int IS NULL OR o.app_id = $2)
          ${isAll ? "" : `AND o.created_at >= (now() - ${intervalSql})`}`,
      [platformId, appId],
    ),
    query<{
      recurring_active: number;
      fixed_term_active: number;
      lifetime_active: number;
    }>(
      `SELECT count(*) FILTER (WHERE order_status = 'active' AND billing = 'recurring')::int AS recurring_active,
              count(*) FILTER (WHERE order_status = 'active' AND billing = 'fixed_term')::int AS fixed_term_active,
              count(*) FILTER (WHERE order_status = 'active' AND billing = 'lifetime')::int AS lifetime_active
         FROM orders
        WHERE platform_id = $1
          AND ($2::int IS NULL OR app_id = $2)`,
      [platformId, appId],
    ),
    query<{
      total_users: number;
      total_devices: number;
    }>(
      `SELECT (SELECT count(*)::int FROM app_users u WHERE u.platform_id = $1 AND ($2::int IS NULL OR u.app_id = $2) AND u.is_active) AS total_users,
              (SELECT count(*)::int FROM devices d WHERE d.platform_id = $1 AND ($2::int IS NULL OR d.app_id = $2) AND d.is_active) AS total_devices`,
      [platformId, appId],
    ),
    query<{
      billing: "lifetime" | "fixed_term" | "recurring";
      count: number;
    }>(
      `SELECT billing, count(*)::int AS count
         FROM orders
        WHERE platform_id = $1
          AND ($2::int IS NULL OR app_id = $2)
          ${isAll ? "" : `AND created_at >= (now() - ${intervalSql})`}
        GROUP BY billing`,
      [platformId, appId],
    ),
    query<{ os: string; count: number }>(
      `SELECT os, count(*)::int AS count
         FROM devices
        WHERE platform_id = $1
          AND ($2::int IS NULL OR app_id = $2)
        GROUP BY os
        ORDER BY count DESC`,
      [platformId, appId],
    ),
    query<{
      id: number;
      order_number: string;
      payment_status: PaymentStatus;
      status: OrderStatus;
      currency: string;
      billing: Billing;
      created_at: string;
      app_name: string;
      user_name: string;
      total: number;
    }>(
      `SELECT o.id, o.order_number, o.payment_status, ${ORDER_STATE} AS status, o.currency,
              o.billing, o.created_at, a.name AS app_name, u.name AS user_name,
              (SELECT COALESCE(SUM(i.quantity * i.unit_amount), 0)::float8 FROM order_items i WHERE i.order_id = o.id) AS total
         FROM orders o
         JOIN apps a ON a.id = o.app_id
         JOIN app_users u ON u.id = o.app_user_id
        WHERE o.platform_id = $1
          AND ($2::int IS NULL OR o.app_id = $2)
        ORDER BY o.created_at DESC
        LIMIT 6`,
      [platformId, appId],
    ),
    query<{
      id: number;
      order_number: string;
      currency: string;
      billing: Billing;
      ends_at: string;
      app_name: string;
      user_name: string;
      total: number;
    }>(
      `SELECT o.id, o.order_number, o.currency, o.billing, o.ends_at, a.name AS app_name, u.name AS user_name,
              (SELECT COALESCE(SUM(i.quantity * i.unit_amount), 0)::float8 FROM order_items i WHERE i.order_id = o.id) AS total
         FROM orders o
         JOIN apps a ON a.id = o.app_id
         JOIN app_users u ON u.id = o.app_user_id
        WHERE o.platform_id = $1
          AND ($2::int IS NULL OR o.app_id = $2)
          AND o.order_status = 'active'
          AND o.ends_at IS NOT NULL
          AND o.ends_at >= now()
          AND o.ends_at <= now() + interval '7 days'
        ORDER BY o.ends_at ASC
        LIMIT 5`,
      [platformId, appId],
    ),
  ]);

  const foundCurrs = currRows.map((r) => r.currency).filter(Boolean);
  // Amounts in different currencies are never added together: everything below is in one
  // currency. Asked for, or else the one that earned the most in this period (USDT when none).
  const currency =
    q.currency?.trim().toUpperCase() || currencySummaries[0]?.currency || foundCurrs[0] || "USDT";
  const availableCurrencies = Array.from(new Set([...foundCurrs, currency])).sort();

  const [
    { rows: revenueRows },
    { rows: refundRows },
    { rows: timeSeries },
    { rows: gatewayRows },
    { rows: appRows },
    prevRows,
  ] = await Promise.all([
    query<{ revenue: number; paid_count: number }>(
      `SELECT COALESCE(SUM(i.quantity * i.unit_amount), 0)::float8 AS revenue,
              COUNT(DISTINCT o.id)::int AS paid_count
         FROM orders o
         JOIN order_items i ON i.order_id = o.id
        WHERE o.platform_id = $1
          AND ($2::int IS NULL OR o.app_id = $2)
          AND o.payment_status = 'paid'
          AND o.currency = $3
          ${isAll ? "" : `AND o.created_at >= (now() - ${intervalSql})`}`,
      [platformId, appId, currency],
    ),
    query<{ refunded: number }>(
      `SELECT COALESCE(SUM(amount_refunded), 0)::float8 AS refunded
         FROM payments
        WHERE platform_id = $1
          AND ($2::int IS NULL OR app_id = $2)
          AND currency = $3
          AND status IN ('refunded', 'partially_refunded')
          ${isAll ? "" : `AND created_at >= (now() - ${intervalSql})`}`,
      [platformId, appId, currency],
    ),
    query<{
      date: string;
      revenue: number;
      orders: number;
    }>(
      `SELECT to_char(o.created_at, '${dateFormat}') AS date,
              COALESCE(SUM(i.quantity * i.unit_amount), 0)::float8 AS revenue,
              COUNT(DISTINCT o.id)::int AS orders
         FROM orders o
         JOIN order_items i ON i.order_id = o.id
        WHERE o.platform_id = $1
          AND ($2::int IS NULL OR o.app_id = $2)
          AND o.currency = $3
          AND o.payment_status = 'paid'
          ${isAll ? "" : `AND o.created_at >= (now() - ${intervalSql})`}
        GROUP BY to_char(o.created_at, '${dateFormat}')
        ORDER BY date ASC`,
      [platformId, appId, currency],
    ),
    query<{
      provider: string;
      count: number;
      total: number;
    }>(
      `SELECT provider, count(*)::int AS count,
              COALESCE(SUM(amount), 0)::float8 AS total
         FROM payments
        WHERE platform_id = $1
          AND ($2::int IS NULL OR app_id = $2)
          AND ($3::text IS NULL OR currency = $3)
          ${isAll ? "" : `AND created_at >= (now() - ${intervalSql})`}
        GROUP BY provider`,
      [platformId, appId, currency],
    ),
    query<{
      id: number;
      name: string;
      orders: number;
      revenue: number;
    }>(
      `SELECT a.id, a.name,
              count(DISTINCT o.id)::int AS orders,
              COALESCE(SUM(i.quantity * i.unit_amount), 0)::float8 AS revenue
         FROM apps a
         LEFT JOIN orders o ON o.app_id = a.id AND o.payment_status = 'paid' AND o.currency = $2 ${isAll ? "" : `AND o.created_at >= (now() - ${intervalSql})`}
         LEFT JOIN order_items i ON i.order_id = o.id
        WHERE a.platform_id = $1
        GROUP BY a.id, a.name
        ORDER BY revenue DESC`,
      [platformId, currency],
    ),
    // previous period, for the growth figure
    isAll
      ? null
      : query<{ prev_revenue: number }>(
          `SELECT COALESCE(SUM(i.quantity * i.unit_amount), 0)::float8 AS prev_revenue
             FROM orders o
             JOIN order_items i ON i.order_id = o.id
            WHERE o.platform_id = $1
              AND ($2::int IS NULL OR o.app_id = $2)
              AND o.payment_status = 'paid'
              AND o.currency = $3
              AND o.created_at < (now() - ${intervalSql})
              AND o.created_at >= (now() - ${prevIntervalSql})`,
          [platformId, appId, currency],
        ).then((r) => r.rows),
  ]);

  const currentRevenue = revenueRows[0]?.revenue ?? 0;
  const prevRevenue = prevRows?.[0]?.prev_revenue ?? 0;
  const growthPercent =
    prevRevenue > 0
      ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 1000) / 10
      : currentRevenue > 0
        ? 100
        : 0;
  const refundedAmount = refundRows[0]?.refunded ?? 0;
  const failedPaymentsCount = failedRows[0]?.count ?? 0;
  const totalOrders = orderCountRows[0]?.total_orders ?? 0;
  const paidOrders = orderCountRows[0]?.paid_orders ?? 0;
  const conversionRate = totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 1000) / 10 : 0;
  const billingBreakdown = {
    lifetime: billingRows.find((b) => b.billing === "lifetime")?.count ?? 0,
    fixed_term: billingRows.find((b) => b.billing === "fixed_term")?.count ?? 0,
    recurring: billingRows.find((b) => b.billing === "recurring")?.count ?? 0,
  };

  return json({
    stats: {
      currency,
      availableCurrencies,
      range,
      kpi: {
        revenue: currentRevenue,
        prevRevenue,
        growthPercent,
        totalOrders,
        paidOrders,
        conversionRate,
        activeSubscriptions: subRows[0]?.recurring_active ?? 0,
        lifetimeLicenses: subRows[0]?.lifetime_active ?? 0,
        activeFixedTerm: subRows[0]?.fixed_term_active ?? 0,
        activeUsers: userDevRows[0]?.total_users ?? 0,
        activeDevices: userDevRows[0]?.total_devices ?? 0,
        refundedAmount,
        failedPaymentsCount,
      },
      currencySummaries: currencySummaries.map((c) => ({
        currency: c.currency,
        total: c.total,
        ordersCount: c.orders_count,
      })),
      timeSeries,
      orderStatuses: {
        active: statusRows[0]?.active ?? 0,
        pending: statusRows[0]?.pending ?? 0,
        expired: statusRows[0]?.expired ?? 0,
        cancelled: statusRows[0]?.cancelled ?? 0,
      },
      paymentStatuses: {
        paid: orderCountRows[0]?.paid_orders ?? 0,
        pending: orderCountRows[0]?.pending_orders ?? 0,
        failed: orderCountRows[0]?.failed_orders ?? 0,
        refunded: orderCountRows[0]?.refunded_orders ?? 0,
      },
      billingBreakdown,
      gateways: gatewayRows,
      deviceOs: osRows,
      apps: appRows,
      recentOrders,
      expiringSoon,
    },
  });
});
