import type { RedirectStatus } from "@/lib/app-config";
import type {
  Billing,
  Currency,
  DeviceOs,
  IntervalUnit,
  OrderStatus,
  PaymentRecordStatus,
  PaymentStatus,
} from "@/lib/commerce";
import type { AccessInfo, Action } from "@/lib/access";
import type { EndpointId, HttpMethod } from "@/server/api/endpoints";

export type { AccessInfo, Action, EndpointId, HttpMethod };

export interface User {
  id: number;
  username: string;
  full_name: string | null;
  email: string | null;
  /** role on the active platform (or the global Super Admin role) */
  role_id: number | null;
  /** "super_admin" | "manager" for the built-in roles, null for custom roles */
  role_key: string | null;
  role_name: string | null;
  /** active platform (for a list: the platform the row belongs to) */
  platform_id: string | null;
  platform_name: string | null;
  must_change_password: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A platform the signed-in user can switch to, with their role there. */
export interface PlatformOption {
  id: string;
  name: string;
  is_active: boolean;
  role_key: string | null;
  role_name: string | null;
}

/** GET /api/auth/me */
export interface Me extends User {
  access: AccessInfo;
  platforms: PlatformOption[];
}

export interface Platform {
  id: string;
  name: string;
  is_active: boolean;
  /** uses the test payment settings (*_TEST) */
  is_test: boolean;
  member_count: number;
  role_count: number;
  created_at: string;
  updated_at: string;
}

export interface RoleOption {
  id: number;
  key: string | null;
  name: string;
}

export interface RoleItem {
  id: number;
  /** "super_admin" | "manager" for the built-in roles */
  key: string | null;
  is_system: boolean;
  /** an inactive role grants nothing */
  is_active: boolean;
  name: string;
  /** role × card × action: which actions of which card this role holds */
  grants: { permission_id: number; actions: Action[] }[];
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionUrl {
  kind: "page" | "api";
  /** set for kind "api" */
  method: HttpMethod | null;
  path: string;
  /** what this URL is used for */
  actions: Action[];
}

export interface PermissionCard {
  id: number;
  /** unique key, given or generated from the name */
  key: string;
  name: string;
  /** optional parent card (grouping only) */
  parent_id: number | null;
  urls: PermissionUrl[];
  /** every action used by at least one URL — what a role can be granted on this card */
  actions: Action[];
  role_count: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionCatalog {
  pages: { path: string; title: string; group: string }[];
  endpoints: {
    id: EndpointId;
    method: HttpMethod;
    path: string;
    summary: string;
    tag: string;
  }[];
}

export interface SmtpServer {
  id: number;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  has_password: boolean;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SmtpServerInput {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

/** Every API error response: a code, a message in the user's language, optional details. */
export interface ApiErrorBody {
  error: string;
  message?: string;
  details?: unknown;
}

/** A platform's app: a website (by domain) or a mobile app (by app id). */
export interface AppItem {
  id: number;
  platform_id: string;
  name: string;
  kind: "domain" | "app_id";
  identifier: string;
  /** masked, e.g. "••••a1b2" — the full values come from the credentials endpoint */
  app_key: string;
  app_secret: string;
  created_at: string;
  updated_at: string;
}

export interface AppCredentials {
  appKey: string;
  appSecret: string;
}

export interface AppConfig {
  app: Pick<AppItem, "id" | "name" | "kind" | "identifier">;
  webhooks: { url: string }[];
  redirects: { status: RedirectStatus; url: string }[];
  /** App API orders may set their own item and price (otherwise templates only) */
  customOrders: boolean;
  /** Sign in with Google: the OAuth client ids this app's ID tokens are issued for */
  googleClientIds: string[];
}

// --- an app's customers and what they buy -------------------------------------------

/** Lists filter by app and creates name one; the platform is always the active one. */
export interface ScopeArgs {
  appId?: number;
}

/** An app's customer (not a portal account). */
export interface AppUser {
  id: number;
  platform_id: string;
  app_id: number;
  app_name: string;
  name: string;
  email: string | null;
  /** E.164, e.g. +94771234567 */
  phone: string | null;
  phone_country: string | null;
  /** how many active devices the user may have */
  max_devices: number;
  /** how many pending (unpaid) orders the user may have */
  max_pending_orders: number;
  is_active: boolean;
  /** active devices */
  device_count: number;
  pending_order_count: number;
  order_count: number;
  created_at: string;
}

export interface Device {
  id: number;
  platform_id: string;
  app_id: number;
  app_name: string;
  app_user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  device_uid: string;
  fingerprint: string | null;
  os: DeviceOs;
  model: string | null;
  is_active: boolean;
  /** last heartbeat from the device's app (App API /heartbeat); null = never */
  last_seen_at: string | null;
  app_version: string | null;
  created_at: string;
}

/** One-time (lifetime / fixed term) or a subscription (recurring), with its access period. */
export interface OrderBilling {
  billing: Billing;
  interval_unit: IntervalUnit | null;
  interval_count: number | null;
}

export interface Order extends OrderBilling {
  id: number;
  order_number: string;
  payment_status: PaymentStatus;
  /** as shown: an active order past its end is expired */
  status: OrderStatus;
  currency: Currency;
  note: string | null;
  /** the access period (set when it becomes active); ends_at null = never expires */
  starts_at: string | null;
  ends_at: string | null;
  paid_at: string | null;
  created_at: string;
  app_id: number;
  app_name: string;
  app_user_id: number;
  user_name: string;
  user_email: string | null;
  /** minor units */
  total: number;
  item_count: number;
  /** a working Stripe payment link (Checkout page, or a failed renewal's invoice); null if none */
  pay_url: string | null;
  /** when the Checkout link stops working (null for an invoice link) */
  pay_url_expires_at: string | null;
  /** set when Stripe bills this subscription (it renews there) */
  stripe_subscription_id: string | null;
  /** set when the order is paid with Google Play (the Play product) */
  google_product_id: string | null;
}

export interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  /** minor units */
  unit_amount: number;
}

/** One payment attempt Stripe reported. Amounts in minor units. */
export interface OrderPayment {
  id: number;
  /** checkout: the first payment; renewal: a subscription's later one */
  kind: "checkout" | "renewal";
  status: PaymentRecordStatus;
  amount: number;
  amount_refunded: number;
  currency: Currency;
  /** card, link, klarna, us_bank_account… */
  method_type: string | null;
  /** brand, last4, exp, wallet, bank_name, email… (what Stripe shows) */
  method_details: Record<string, string> | null;
  receipt_url: string | null;
  failure_message: string | null;
  livemode: boolean;
  paid_at: string | null;
  created_at: string;
}

/** A payment on the Payments page, with its order and customer. */
export interface Payment extends OrderPayment {
  order_id: number;
  order_number: string;
  billing: Billing;
  reference: string;
  invoice_id: string | null;
  app_id: number;
  app_name: string;
  app_user_id: number;
  user_name: string;
  user_email: string | null;
}

export interface OrderDetail extends Omit<Order, "item_count"> {
  platform_id: string;
  items: OrderItem[];
  payments: OrderPayment[];
}

/** A new Stripe payment link. */
export interface PayLink {
  url: string;
  expiresAt: string;
}

/** A new order: from one of the app's templates, or custom. */
export type OrderInput = ScopeArgs & {
  appUserId: number;
  /** false: no Stripe payment link (paid another way) */
  createCheckout?: boolean;
  note: string;
} & (
    | { templateId: number }
    | ({
        currency: Currency;
        items: { name: string; quantity: number; unitAmount: number }[];
      } & (
        | { billing: "lifetime" }
        | { billing: "fixed_term" | "recurring"; intervalUnit: IntervalUnit; intervalCount: number }
      ))
  );

/** An app's ready-made order: item, price (minor units) and billing. */
export interface OrderTemplate extends OrderBilling {
  id: number;
  app_id: number;
  app_name: string;
  /** what apps send to order it (App API `template`) */
  code: string;
  name: string;
  currency: Currency;
  unit_amount: number;
  google_product_id: string | null;
  is_active: boolean;
  order_count: number;
  created_at: string;
}

export type OrderTemplateInput = {
  code: string;
  name: string;
  currency: Currency;
  unitAmount: number;
  googleProductId: string;
} & (
  | { billing: "lifetime" }
  | { billing: "fixed_term" | "recurring"; intervalUnit: IntervalUnit; intervalCount: number }
);

export interface DashboardKpi {
  revenue: number;
  prevRevenue: number;
  growthPercent: number;
  totalOrders: number;
  paidOrders: number;
  conversionRate: number;
  activeSubscriptions: number;
  lifetimeLicenses: number;
  activeFixedTerm: number;
  activeUsers: number;
  activeDevices: number;
  refundedAmount: number;
  failedPaymentsCount: number;
}

export interface CurrencyRevenueSummary {
  currency: string;
  total: number;
  ordersCount: number;
}

export interface RevenueTimeSeriesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrderStatusBreakdown {
  active: number;
  pending: number;
  expired: number;
  cancelled: number;
}

export interface PaymentStatusBreakdown {
  paid: number;
  pending: number;
  failed: number;
  refunded: number;
}

export interface BillingBreakdown {
  lifetime: number;
  fixed_term: number;
  recurring: number;
}

export interface GatewayBreakdownItem {
  provider: string;
  count: number;
  total: number;
}

export interface DeviceOsItem {
  os: string;
  count: number;
}

export interface AppRevenueItem {
  id: number;
  name: string;
  orders: number;
  revenue: number;
}

export interface RecentOrderSummary {
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
}

export interface ExpiringOrderSummary {
  id: number;
  order_number: string;
  currency: string;
  billing: Billing;
  ends_at: string;
  app_name: string;
  user_name: string;
  total: number;
}

export interface DashboardStats {
  currency: string;
  availableCurrencies: string[];
  range: string;
  kpi: DashboardKpi;
  currencySummaries: CurrencyRevenueSummary[];
  timeSeries: RevenueTimeSeriesPoint[];
  orderStatuses: OrderStatusBreakdown;
  paymentStatuses: PaymentStatusBreakdown;
  billingBreakdown: BillingBreakdown;
  gateways: GatewayBreakdownItem[];
  deviceOs: DeviceOsItem[];
  apps: AppRevenueItem[];
  recentOrders: RecentOrderSummary[];
  expiringSoon: ExpiringOrderSummary[];
}

// --- lists are read a page (25 rows) at a time --------------------------------------------

export interface PageInfo {
  page: number;
  /** another page follows */
  hasMore: boolean;
}
export interface Paged<T> extends PageInfo {
  items: T[];
}
export interface PageArgs {
  /** 1-based; default 1 */
  page?: number;
}
