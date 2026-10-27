import { z } from "zod";
// redirect statuses (app config) differ from order payment statuses (commerce)
import { isHttpUrl, MAX_WEBHOOKS, REDIRECT_STATUSES } from "@/lib/app-config";
import { isCountry, toE164, type CountryCode } from "@/lib/phone";
import {
  CURRENCIES,
  DEVICE_OS,
  INTERVAL_UNITS,
  ORDER_STATUSES,
  PAYMENT_RECORD_STATUSES,
  PAYMENT_STATUSES,
} from "@/lib/commerce";
import { ACTIONS, PERMISSION_KEY_RE } from "@/lib/access";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a symbol");

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const completeSetupSchema = z.object({
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().max(100),
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
});

const roleId = z.number().int().positive();

export const createManagerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9._-]+$/, "Only letters, numbers, dot, dash and underscore"),
  roleId,
  /** target platform; omitted = the active platform (others need the Platforms card) */
  platformId: z.uuid().optional(),
});

export const updateUserRoleSchema = z.object({ roleId });

// Temporary passwords skip the strength rules: the user must replace them with a
// strong one on first sign in. Leave empty to have the server generate one.
export const resetPasswordSchema = z.object({
  password: z.string().max(128).optional(),
});

export const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

// --- shared path / query params ------------------------------------------------

export const idParams = z.object({ id: z.coerce.number().int().positive() });

// --- roles & permissions ---------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const action = z.enum(ACTIONS);

/** For one permission card, some of its actions. */
const grantChanges = z
  .array(
    z.object({
      permissionId: z.number().int().positive(),
      actions: z.array(action).min(1).max(ACTIONS.length),
    }),
  )
  .max(500)
  .default([]);

/** New role: its name and grants (card × actions). */
export const roleSchema = z.object({
  name: z.string().trim().min(1).max(50),
  grants: grantChanges,
});

/**
 * Role update: the name and only what changes — grants to `add` and to `remove`.
 * Each changed card × action must be held by the editor.
 */
export const roleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50),
  add: grantChanges,
  remove: grantChanges,
});

/** One URL on a card and the actions it is used for. */
export const permissionUrlSchema = z
  .object({
    kind: z.enum(["page", "api"]),
    /** required for kind "api" */
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).nullish(),
    path: z.string().trim().min(1).max(255),
    actions: z.array(action).min(1).max(ACTIONS.length),
  })
  .refine((u) => (u.kind === "api") === !!u.method, {
    message: "method is required for api URLs only",
  });

export const permissionSchema = z.object({
  /** unique key; empty or omitted = generate one from the name (on update: keep the current key) */
  key: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .optional()
    .transform((v) => v || undefined)
    .pipe(
      z
        .string()
        .regex(
          PERMISSION_KEY_RE,
          "Use lowercase letters, numbers, dot, dash or underscore",
        )
        .optional(),
    ),
  name: z.string().trim().min(1).max(80),
  /** optional parent card id (null = top level) */
  parentId: z.number().int().positive().nullish(),
  /** page paths and API endpoints, validated against the code catalogs */
  urls: z.array(permissionUrlSchema).max(300),
});

// --- SMTP servers ----------------------------------------------------------------

export const smtpServerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: optionalText(255),
  /** omit to keep the stored password; empty string clears it */
  password: z.string().max(500).optional(),
  fromEmail: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  fromName: optionalText(100),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

export const smtpTestSchema = z.object({
  /** when given, a test email is sent here; otherwise only the connection is verified */
  to: z.string().trim().toLowerCase().max(255).pipe(z.email()).optional(),
});

// --- platforms ---------------------------------------------------------------------

export const platformIdParams = z.object({ id: z.uuid() });

export const platformSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const switchPlatformSchema = z.object({ platformId: z.uuid() });

export const roleOptionsQuery = z.object({
  /** roles of this platform; omitted = the active platform */
  platformId: z.uuid().optional(),
});

// --- apps ---------------------------------------------------------------------------

/** a hostname such as shop.example.com (no scheme, port or path) */
export const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** a reverse-DNS app id such as com.example.shop */
export const APP_ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/** An app is identified by a domain (website) or an app id (mobile app). */
const appName = z.string().trim().min(1).max(80);
export const appSchema = z.discriminatedUnion("kind", [
  z.object({
    name: appName,
    kind: z.literal("domain"),
    identifier: z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .regex(DOMAIN_RE, "Enter a domain like shop.example.com"),
  }),
  z.object({
    name: appName,
    kind: z.literal("app_id"),
    identifier: z
      .string()
      .trim()
      .max(255)
      .regex(APP_ID_RE, "Enter an app id like com.example.shop"),
  }),
]);

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(isHttpUrl, "Enter a full URL starting with https://");

/** An app's config: replaced as a whole on save. */
export const appConfigSchema = z.object({
  webhooks: z
    .array(z.object({ url: httpUrl }))
    .max(MAX_WEBHOOKS)
    .refine(
      (list) => new Set(list.map((w) => w.url)).size === list.length,
      "Each webhook URL only once",
    ),
  redirects: z
    .array(z.object({ status: z.enum(REDIRECT_STATUSES), url: httpUrl }))
    .refine(
      (list) => new Set(list.map((r) => r.status)).size === list.length,
      "One redirect per status",
    ),
});

// --- an app's customers and what they buy (scoped: see scope.ts) ---------------------

const id = z.number().int().positive();
/** Optional text: "" and missing become null. */
const nullableText = (
  max: number,
  check?: (v: string) => boolean,
  message?: string,
) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !v || !check || check(v), message)
    .nullish()
    .transform((v) => v || null);
const isEmail = (v: string) => z.email().safeParse(v).success;

/** Optional app filter for lists (the platform is always the active one, see scope.ts). */
export const scopeQuery = z.object({
  appId: z.coerce.number().int().positive().optional(),
});
const scopeBody = { appId: id };

export const appUsersQuery = scopeQuery.extend({
  search: z.string().trim().max(100).optional(),
});
/** `{ country: "LK", number: "077 123 4567" }` → `{ country, e164: "+94771234567" }` (or null). */
const phoneInput = z
  .object({
    country: z.string().refine(isCountry, "Choose a country"),
    number: z.string().trim().min(1).max(30),
  })
  .transform((p, ctx) => {
    const e164 = toE164(p.number, p.country as CountryCode);
    if (!e164) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid phone number for the chosen country",
      });
      return z.NEVER;
    }
    return { country: p.country as CountryCode, e164 };
  })
  .nullish()
  .transform((p) => p ?? null);
const contact = {
  email: nullableText(255, isEmail, "Enter a valid email"),
  phone: phoneInput,
};
/** A user is reachable: an email, a phone, or both. */
const hasContact = (u: { email: string | null; phone: unknown }) =>
  !!u.email || !!u.phone;
const contactMessage = {
  message: "Enter an email or a phone number",
  path: ["email"],
};
const maxDevices = z.number().int().min(1).max(1000);
const maxPendingOrders = z.number().int().min(1).max(100);
/** The name may be left out (a quick add with just an email): the email or phone is used. */
export const appUserSchema = z
  .object({
    ...scopeBody,
    name: nullableText(120),
    ...contact,
    maxDevices: maxDevices.default(1),
    maxPendingOrders: maxPendingOrders.default(3),
  })
  .refine(hasContact, contactMessage);
/** On / off (users.updateStatus) and allowed devices (users.updateMaxDevices) change on their own. */
export const appUserUpdateSchema = z
  .object({ name: z.string().trim().min(1).max(120), ...contact })
  .refine(hasContact, contactMessage);
export const maxDevicesSchema = z.object({ maxDevices });
export const maxPendingOrdersSchema = z.object({ maxPendingOrders });

const deviceFields = {
  appUserId: id.nullish().transform((v) => v ?? null),
  deviceUid: z.string().trim().min(1).max(191),
  fingerprint: nullableText(255),
  os: z.enum(DEVICE_OS),
  model: nullableText(120),
};
export const devicesQuery = scopeQuery.extend({
  appUserId: z.coerce.number().int().positive().optional(),
});
export const deviceSchema = z.object({ ...scopeBody, ...deviceFields });
/** On / off is changed on its own (devices.updateStatus). */
export const deviceUpdateSchema = z.object(deviceFields);

export const ordersQuery = scopeQuery.extend({
  appUserId: z.coerce.number().int().positive().optional(),
  payment: z.enum(PAYMENT_STATUSES).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});
const orderBase = {
  ...scopeBody,
  /** false: no Stripe payment link (paid another way) */
  createCheckout: z.boolean().default(true),
  appUserId: id,
  currency: z.enum(CURRENCIES),
  note: nullableText(500),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        quantity: z.number().int().min(1).max(1000),
        unitAmount: z.number().int().min(0).max(1e12),
      }),
    )
    .min(1)
    .max(50),
};
const period = {
  intervalUnit: z.enum(INTERVAL_UNITS),
  intervalCount: z.number().int().min(1).max(365),
};
/** One-time (lifetime, or access for a period) or a subscription renewing every period. */
export const customOrderSchema = z.discriminatedUnion("billing", [
  // lifetime has no period: one sent by mistake is refused, not dropped
  z.strictObject({ ...orderBase, billing: z.literal("lifetime") }),
  z.object({ ...orderBase, billing: z.literal("fixed_term"), ...period }),
  z.object({ ...orderBase, billing: z.literal("recurring"), ...period }),
]);
/** An order made from a template: item, price and billing come from the template. */
export const templateOrderSchema = z.object({
  ...scopeBody,
  createCheckout: z.boolean().default(true),
  appUserId: id,
  templateId: id,
  note: nullableText(500),
});
/** A new order: from a template (`templateId`) or custom (items + billing). */
export const orderSchema = z.union([templateOrderSchema, customOrderSchema]);

// --- order templates ----------------------------------------------------------------------

/** What apps send to order it ("pro_monthly"): lowercase letters, digits, dot, dash, underscore. */
const templateCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{0,59}$/, "Letters, numbers, dot, dash or underscore (max 60)");
const templateFields = {
  code: templateCode,
  name: z.string().trim().min(1).max(160),
  currency: z.enum(CURRENCIES),
  /** minor units */
  unitAmount: z.number().int().min(0).max(1e12),
  /** the Google Play product it's sold as in Android apps (optional) */
  googleProductId: nullableText(150),
};
export const orderTemplateSchema = z.discriminatedUnion("billing", [
  z.strictObject({ ...scopeBody, ...templateFields, billing: z.literal("lifetime") }),
  z.object({ ...scopeBody, ...templateFields, billing: z.literal("fixed_term"), ...period }),
  z.object({ ...scopeBody, ...templateFields, billing: z.literal("recurring"), ...period }),
]);
/** The app can't change — a template belongs to one app. */
export const orderTemplateUpdateSchema = z.discriminatedUnion("billing", [
  z.strictObject({ ...templateFields, billing: z.literal("lifetime") }),
  z.object({ ...templateFields, billing: z.literal("fixed_term"), ...period }),
  z.object({ ...templateFields, billing: z.literal("recurring"), ...period }),
]);
export const orderTemplatesQuery = scopeQuery.extend({
  /** "true": only active templates (the order form) */
  active: z.enum(["true", "false"]).optional(),
});
export const paymentStatusSchema = z.object({
  status: z.enum(PAYMENT_STATUSES),
});
export const orderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

// --- payments (Stripe) -------------------------------------------------------------------

/** Payments list: the active platform's, optionally of one app / order / status, or a search. */
export const paymentsQuery = scopeQuery.extend({
  orderId: z.coerce.number().int().positive().optional(),
  status: z.enum(PAYMENT_RECORD_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
});

// --- App API (/api/webhooks/*): signed requests from a platform's apps ---------------------
// Every value is a string and unknown fields are refused, so what was signed is exactly what
// is checked (no trimming or converting before the signature check, see app-api.ts).

const signed = {
  appKey: z.string().min(1).max(100),
  /** Unix seconds */
  timestamp: z.string().regex(/^\d{1,12}$/, "Unix time in seconds"),
  /** HMAC-SHA256 hex */
  signature: z.string().min(1).max(128),
};
const apiEmail = z.string().max(255).pipe(z.email());
const digits = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,4}$/, "A whole number")
    .refine((v) => Number(v) >= min && Number(v) <= max, `Between ${min} and ${max}`);

export const apiUserSchema = z
  .strictObject({
    ...signed,
    email: apiEmail.optional(),
    password: z.string().min(8, "At least 8 characters").max(128).optional(),
    /** Sign in with Google: the ID token the app got from Google — instead of email + password */
    googleIdToken: z.string().min(1).max(4096).optional(),
  })
  .refine((o) => (o.googleIdToken ? !o.email && !o.password : !!o.email && !!o.password), {
    message: "Send either googleIdToken, or email + password (not both)",
  });
export const apiDeviceSchema = z.strictObject({
  ...signed,
  deviceUid: z.string().min(1).max(191),
  os: z.enum(DEVICE_OS),
  fingerprint: z.string().max(255).optional(),
  model: z.string().max(120).optional(),
});
export const apiOrderSchema = z
  .strictObject({
    ...signed,
    /** an order template's code — instead of itemName / amount / currency / billing */
    template: z.string().min(1).max(60).optional(),
    itemName: z.string().min(1).max(160).optional(),
    /** in the currency's units, e.g. "9.99" */
    amount: z.string().max(20).optional(),
    quantity: digits(1, 1000).optional(),
    currency: z.enum(CURRENCIES).optional(),
    billing: z.enum(["lifetime", "fixed_term", "recurring"]).optional(),
    intervalUnit: z.enum(INTERVAL_UNITS).optional(),
    intervalCount: digits(1, 365).optional(),
    note: z.string().max(500).optional(),
    /** "false": no Stripe payment link (e.g. paid with Google Play); default "true" */
    createCheckout: z.enum(["true", "false"]).optional(),
  })
  .refine(
    (o) =>
      o.template
        ? !o.itemName && !o.amount && !o.currency && !o.billing && !o.intervalUnit && !o.intervalCount && !o.quantity
        : !!o.itemName && !!o.amount && !!o.currency && !!o.billing,
    {
      message: "Send either template, or itemName + amount + currency + billing (not both)",
      path: ["template"],
    },
  )
  .refine((o) => !!o.template || (o.billing === "lifetime") === (!o.intervalUnit && !o.intervalCount), {
    message: "intervalUnit and intervalCount are needed for fixed_term and recurring, and not allowed for lifetime",
    path: ["intervalUnit"],
  });
export const apiVerifyQuery = z.strictObject({ ...signed, email: apiEmail });
export const apiRefreshSchema = z.strictObject({ ...signed, refreshToken: z.string().min(1).max(200) });

export const dashboardStatsQuery = z.strictObject({
  appId: z.coerce.number().int().positive().optional(),
  currency: z.string().trim().max(10).optional(),
  range: z.enum(["7d", "30d", "90d", "1y", "all"]).optional(),
});
