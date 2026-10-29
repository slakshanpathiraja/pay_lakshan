import type { ZodObject, ZodType } from "zod";
import type { AccessLevel } from "@/lib/access";
import {
  appConfigSchema,
  appSchema,
  appUserSchema,
  appUsersQuery,
  appUserUpdateSchema,
  maxDevicesSchema,
  maxPendingOrdersSchema,
  deviceSchema,
  devicesQuery,
  deviceUpdateSchema,
  orderSchema,
  orderTemplateSchema,
  orderTemplatesQuery,
  orderTemplateUpdateSchema,
  ordersQuery,
  orderStatusSchema,
  paymentStatusSchema,
  paymentsQuery,
  apiDeviceSchema,
  apiOrderSchema,
  apiRefreshSchema,
  apiUserSchema,
  apiVerifyQuery,
  changePasswordSchema,
  completeSetupSchema,
  createManagerSchema,
  idParams,
  loginSchema,
  permissionSchema,
  platformIdParams,
  platformSchema,
  roleOptionsQuery,
  resetPasswordSchema,
  roleSchema,
  roleUpdateSchema,
  smtpServerSchema,
  smtpTestSchema,
  switchPlatformSchema,
  updateProfileSchema,
  updateStatusSchema,
  updateUserRoleSchema,
  dashboardStatsQuery,
} from "../schemas";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface EndpointDef {
  method: HttpMethod;
  /** OpenAPI-style path; `{name}` segments must be declared in `params` */
  path: string;
  /** Swagger tag / group in the permission picker */
  tag:
    | "Auth"
    | "Managers"
    | "Roles"
    | "Permissions"
    | "Platforms"
    | "Apps"
    | "Users"
    | "Devices"
    | "Orders"
    | "Order templates"
    | "Payments"
    | "Stripe"
    | "App API"
    | "Google Play"
    | "SMTP"
    | "System";
  summary: string;
  description?: string;
  access: AccessLevel;
  params?: ZodObject;
  query?: ZodObject;
  body?: ZodType;
  /**
   * The endpoint works on the active platform's data: route() resolves it, and checks that
   * an `appId` in the body or query belongs to it.
   */
  scope?: true;
}

/**
 * API catalog — the single definition of every backend endpoint.
 *
 * To add an endpoint: add it here, then create the route file and wrap the
 * handler with `route("<id>", ...)`. Method, URL params, query and body are
 * validated from this definition, access is enforced, it appears in Swagger,
 * and (when access is "permission") it can be granted on a permission card.
 */
const SCOPED_LIST = "The active platform's. Filter by `appId`.";
const SIGNED = " Every value is a string; signed with the app secret (see the App API section).";
const SCOPED_CREATE =
  "Goes to the active platform; `appId` must be one of its apps.";

export const endpoints = {
  // System
  "dashboard.stats": {
    method: "GET",
    path: "/api/dashboard/stats",
    tag: "System",
    summary: "Platform and app statistics for the dashboard",
    description: "Revenue, orders, customer metrics, charts and multi-currency breakdowns for the active platform.",
    access: "authenticated",
    scope: true,
    query: dashboardStatsQuery,
  },
  "system.health": {
    method: "GET",
    path: "/api/health",
    tag: "System",
    summary: "Health check (also expires overdue orders)",
    description:
      "Checks the database, then marks active orders whose period has ended as expired. Call it from a " +
      "cron job (e.g. every few minutes) so stored statuses stay current.",
    access: "public",
  },

  // Auth — your own account
  "auth.login": {
    method: "POST",
    path: "/api/auth/login",
    tag: "Auth",
    summary: "Sign in",
    description:
      "Sets the session cookie. Rate limited to 20 attempts per 15 minutes per IP.",
    access: "public",
    body: loginSchema,
  },
  "auth.logout": {
    method: "POST",
    path: "/api/auth/logout",
    tag: "Auth",
    summary: "Sign out",
    description: "Clears the cookie and revokes all of the user's sessions.",
    access: "public",
  },
  "auth.me": {
    method: "GET",
    path: "/api/auth/me",
    tag: "Auth",
    summary: "Current user, role and access",
    access: "pending",
  },
  "auth.completeSetup": {
    method: "POST",
    path: "/api/auth/complete-setup",
    tag: "Auth",
    summary: "First sign in setup",
    description:
      "Only while the user has a temporary password. Sets email and a strong password.",
    access: "pending",
    body: completeSetupSchema,
  },
  "auth.changePassword": {
    method: "POST",
    path: "/api/auth/change-password",
    tag: "Auth",
    summary: "Change own password",
    access: "pending",
    body: changePasswordSchema,
  },
  "auth.switchPlatform": {
    method: "POST",
    path: "/api/auth/platform",
    tag: "Auth",
    summary: "Switch the active platform",
    description:
      "Re-issues the session for another platform you belong to (any platform for a super admin).",
    access: "authenticated",
    body: switchPlatformSchema,
  },
  "auth.updateProfile": {
    method: "PATCH",
    path: "/api/auth/profile",
    tag: "Auth",
    summary: "Update own name and email",
    access: "authenticated",
    body: updateProfileSchema,
  },

  // Managers
  "managers.list": {
    method: "GET",
    path: "/api/managers",
    tag: "Managers",
    summary: "List managers",
    access: "permission",
  },
  "managers.create": {
    method: "POST",
    path: "/api/managers",
    tag: "Managers",
    summary: "Create a manager",
    description:
      "Generates a temporary password, returned once in `temporaryPassword`.",
    access: "permission",
    body: createManagerSchema,
  },
  "managers.updateRole": {
    method: "PATCH",
    path: "/api/managers/{id}/role",
    tag: "Managers",
    summary: "Change a manager's role",
    access: "permission",
    params: idParams,
    body: updateUserRoleSchema,
  },
  "managers.resetPassword": {
    method: "POST",
    path: "/api/managers/{id}/reset-password",
    tag: "Managers",
    summary: "Set a temporary password for a manager",
    description:
      "Any password is accepted; omit it to generate one. Returned once in `temporaryPassword`.",
    access: "permission",
    params: idParams,
    body: resetPasswordSchema,
  },
  "managers.updateStatus": {
    method: "PATCH",
    path: "/api/managers/{id}/status",
    tag: "Managers",
    summary: "Enable or disable a manager",
    access: "permission",
    params: idParams,
    body: updateStatusSchema,
  },
  "managers.delete": {
    method: "DELETE",
    path: "/api/managers/{id}",
    tag: "Managers",
    summary: "Delete a manager",
    access: "permission",
    params: idParams,
  },

  // Roles
  "roles.options": {
    method: "GET",
    path: "/api/roles/options",
    tag: "Roles",
    summary: "Role names for pickers",
    description:
      "Roles of the active platform, or of `platformId` (needs the Platforms card unless super admin).",
    access: "authenticated",
    query: roleOptionsQuery,
  },
  "roles.list": {
    method: "GET",
    path: "/api/roles",
    tag: "Roles",
    summary: "List roles with their permission cards",
    access: "permission",
  },
  "roles.create": {
    method: "POST",
    path: "/api/roles",
    tag: "Roles",
    summary: "Create a role",
    description: "Each granted card × action must be one you hold yourself.",
    access: "permission",
    body: roleSchema,
  },
  "roles.update": {
    method: "PUT",
    path: "/api/roles/{id}",
    tag: "Roles",
    summary: "Update a role",
    description:
      "Send only the changes (`add` / `remove`); each must be a card × action you hold yourself.",
    access: "permission",
    params: idParams,
    body: roleUpdateSchema,
  },
  "roles.updateStatus": {
    method: "PATCH",
    path: "/api/roles/{id}/status",
    tag: "Roles",
    summary: "Activate or deactivate a role",
    description:
      "An inactive role grants nothing. Not the Super Admin role; non super admins not their own role.",
    access: "permission",
    params: idParams,
    body: updateStatusSchema,
  },
  "roles.delete": {
    method: "DELETE",
    path: "/api/roles/{id}",
    tag: "Roles",
    summary: "Delete a role",
    description: "Fails with ROLE_IN_USE while users still have it.",
    access: "permission",
    params: idParams,
  },

  // Permission cards
  "permissions.catalog": {
    method: "GET",
    path: "/api/permissions/catalog",
    tag: "Permissions",
    summary: "Pages and endpoints that can be granted",
    access: "permission",
  },
  "permissions.list": {
    method: "GET",
    path: "/api/permissions",
    tag: "Permissions",
    summary: "List permission cards",
    access: "permission",
  },
  "permissions.create": {
    method: "POST",
    path: "/api/permissions",
    tag: "Permissions",
    summary: "Create a permission card",
    access: "permission",
    body: permissionSchema,
  },
  "permissions.update": {
    method: "PUT",
    path: "/api/permissions/{id}",
    tag: "Permissions",
    summary: "Update a permission card",
    access: "permission",
    params: idParams,
    body: permissionSchema,
  },
  "permissions.delete": {
    method: "DELETE",
    path: "/api/permissions/{id}",
    tag: "Permissions",
    summary: "Delete a permission card",
    access: "permission",
    params: idParams,
  },

  // Platforms
  "platforms.list": {
    method: "GET",
    path: "/api/platforms",
    tag: "Platforms",
    summary: "List platforms",
    description:
      "Super admin: every platform. Others: the platforms they belong to.",
    access: "permission",
  },
  "platforms.current": {
    method: "GET",
    path: "/api/platforms/current",
    tag: "Platforms",
    summary: "The active platform",
    description:
      "Details of the platform you're working in, with your role there (any signed-in member).",
    access: "authenticated",
  },
  "platforms.updateOwn": {
    method: "PUT",
    path: "/api/platforms/current",
    tag: "Platforms",
    summary: "Rename your own platform",
    description:
      'Renames the platform you\'re working in (no id needed). Granted by the "Own platform update" card.',
    access: "permission",
    body: platformSchema,
  },
  "platforms.create": {
    method: "POST",
    path: "/api/platforms",
    tag: "Platforms",
    summary: "Create a platform",
    description:
      "Generates the platform id, its Manager role and its first account (`manager.<name>`, Manager role). " +
      "The account's temporary password is returned once in `account.temporaryPassword`. " +
      "A non super admin creator is also added to the new platform as its Manager.",
    access: "permission",
    body: platformSchema,
  },
  "platforms.update": {
    method: "PUT",
    path: "/api/platforms/{id}",
    tag: "Platforms",
    summary: "Rename a platform",
    description: "Non super admins can only rename platforms they belong to.",
    access: "permission",
    params: platformIdParams,
    body: platformSchema,
  },
  "platforms.updateStatus": {
    method: "PATCH",
    path: "/api/platforms/{id}/status",
    tag: "Platforms",
    summary: "Activate or deactivate a platform",
    description:
      "Members can't use an inactive platform (super admins still can). " +
      "Non super admins: only platforms they belong to, and not their active platform.",
    access: "permission",
    params: platformIdParams,
    body: updateStatusSchema,
  },
  "platforms.delete": {
    method: "DELETE",
    path: "/api/platforms/{id}",
    tag: "Platforms",
    summary: "Delete a platform",
    description:
      "Removes its roles and memberships; accounts left without a platform are deleted. " +
      "Non super admins: only platforms they belong to, and not their active platform.",
    access: "permission",
    params: platformIdParams,
  },

  // Apps (per platform)
  "apps.list": {
    method: "GET",
    path: "/api/apps",
    tag: "Apps",
    summary: "List the active platform's apps",
    access: "permission",
    scope: true,
  },
  "apps.create": {
    method: "POST",
    path: "/api/apps",
    tag: "Apps",
    summary: "Add an app to the active platform",
    description:
      "A website by `domain` or a mobile app by `app_id`; identifiers are unique across platforms. " +
      "Generates the app key and secret, returned in full in `credentials`.",
    access: "permission",
    body: appSchema,
  },
  "apps.update": {
    method: "PUT",
    path: "/api/apps/{id}",
    tag: "Apps",
    summary: "Change an app's name and domain / app id",
    access: "permission",
    params: idParams,
    body: appSchema,
  },
  "apps.credentials": {
    method: "GET",
    path: "/api/apps/{id}/credentials",
    tag: "Apps",
    summary: "Show an app's key and secret",
    description: "Lists only return them masked; this returns them in full.",
    access: "permission",
    params: idParams,
  },
  "apps.config": {
    method: "GET",
    path: "/api/apps/{id}/config",
    tag: "Apps",
    summary: "An app's webhooks and redirects",
    access: "permission",
    params: idParams,
  },
  "apps.updateConfig": {
    method: "PUT",
    path: "/api/apps/{id}/config",
    tag: "Apps",
    summary: "Save an app's webhooks and redirects",
    description:
      "Replaces the whole config: webhook URLs, and a redirect URL per payment status.",
    access: "permission",
    params: idParams,
    body: appConfigSchema,
  },
  "apps.delete": {
    method: "DELETE",
    path: "/api/apps/{id}",
    tag: "Apps",
    summary: "Remove an app",
    access: "permission",
    params: idParams,
  },

  // SMTP servers (per platform)
  "smtp.list": {
    method: "GET",
    path: "/api/smtp-servers",
    tag: "SMTP",
    summary: "List SMTP servers",
    description: "Passwords are never returned.",
    access: "permission",
  },
  "smtp.create": {
    method: "POST",
    path: "/api/smtp-servers",
    tag: "SMTP",
    summary: "Add an SMTP server",
    access: "permission",
    body: smtpServerSchema,
  },
  "smtp.update": {
    method: "PUT",
    path: "/api/smtp-servers/{id}",
    tag: "SMTP",
    summary: "Update an SMTP server",
    description: "Omit `password` to keep the stored one.",
    access: "permission",
    params: idParams,
    body: smtpServerSchema,
  },
  "smtp.updateStatus": {
    method: "PATCH",
    path: "/api/smtp-servers/{id}/status",
    tag: "SMTP",
    summary: "Activate or deactivate an SMTP server",
    description: "Inactive servers are never used to send email.",
    access: "permission",
    params: idParams,
    body: updateStatusSchema,
  },
  "smtp.delete": {
    method: "DELETE",
    path: "/api/smtp-servers/{id}",
    tag: "SMTP",
    summary: "Delete an SMTP server",
    access: "permission",
    params: idParams,
  },
  "smtp.test": {
    method: "POST",
    path: "/api/smtp-servers/{id}/test",
    tag: "SMTP",
    summary: "Test an SMTP server",
    description:
      "Verifies the connection and login; sends a test email when `to` is given.",
    access: "permission",
    params: idParams,
    body: smtpTestSchema,
  },

  // An app's customers and what they buy — all scoped to a platform + app (scope.ts)
  "users.list": {
    method: "GET",
    path: "/api/users",
    tag: "Users",
    summary: "List an app's users",
    description: SCOPED_LIST,
    access: "permission",
    scope: true,
    query: appUsersQuery,
  },
  "users.create": {
    method: "POST",
    path: "/api/users",
    tag: "Users",
    summary: "Add a user (an app's customer)",
    description: SCOPED_CREATE,
    access: "permission",
    scope: true,
    body: appUserSchema,
  },
  "users.update": {
    method: "PUT",
    path: "/api/users/{id}",
    tag: "Users",
    summary: "Change a user (an app's customer)",
    access: "permission",
    scope: true,
    params: idParams,
    body: appUserUpdateSchema,
  },
  "users.updateStatus": {
    method: "PATCH",
    path: "/api/users/{id}/status",
    tag: "Users",
    summary: "Turn a user on or off",
    access: "permission",
    scope: true,
    params: idParams,
    body: updateStatusSchema,
  },
  "users.updateMaxDevices": {
    method: "PATCH",
    path: "/api/users/{id}/max-devices",
    tag: "Users",
    summary: "Change how many active devices a user may have",
    description:
      "Lowering it below the active devices keeps them; new ones are refused until under the limit.",
    access: "permission",
    scope: true,
    params: idParams,
    body: maxDevicesSchema,
  },
  "users.updateMaxPendingOrders": {
    method: "PATCH",
    path: "/api/users/{id}/max-pending-orders",
    tag: "Users",
    summary: "Change how many pending (unpaid) orders a user may have",
    description:
      "Lowering it below the pending orders keeps them; new orders are refused until under the limit.",
    access: "permission",
    scope: true,
    params: idParams,
    body: maxPendingOrdersSchema,
  },
  "users.delete": {
    method: "DELETE",
    path: "/api/users/{id}",
    tag: "Users",
    summary: "Delete a user (an app's customer)",
    description:
      "Deletes their devices, orders (with items and payment records) and sign-in tokens too. Open payment " +
      "links and Stripe subscriptions are stopped first.",
    access: "permission",
    scope: true,
    params: idParams,
  },
  "devices.list": {
    method: "GET",
    path: "/api/devices",
    tag: "Devices",
    summary: "List devices",
    description: SCOPED_LIST + " Or one user's devices with `appUserId`.",
    access: "permission",
    scope: true,
    query: devicesQuery,
  },
  "devices.create": {
    method: "POST",
    path: "/api/devices",
    tag: "Devices",
    summary: "Add a device",
    description: SCOPED_CREATE,
    access: "permission",
    scope: true,
    body: deviceSchema,
  },
  "devices.update": {
    method: "PUT",
    path: "/api/devices/{id}",
    tag: "Devices",
    summary: "Change a device",
    access: "permission",
    scope: true,
    params: idParams,
    body: deviceUpdateSchema,
  },
  "devices.updateStatus": {
    method: "PATCH",
    path: "/api/devices/{id}/status",
    tag: "Devices",
    summary: "Turn a device on or off",
    access: "permission",
    scope: true,
    params: idParams,
    body: updateStatusSchema,
  },
  "devices.delete": {
    method: "DELETE",
    path: "/api/devices/{id}",
    tag: "Devices",
    summary: "Delete a device",
    access: "permission",
    scope: true,
    params: idParams,
  },
  "orders.list": {
    method: "GET",
    path: "/api/orders",
    tag: "Orders",
    summary: "List orders",
    description: SCOPED_LIST + " Or one user's orders with `appUserId`.",
    access: "permission",
    scope: true,
    query: ordersQuery,
  },
  "orders.get": {
    method: "GET",
    path: "/api/orders/{id}",
    tag: "Orders",
    summary: "An order with its items",
    access: "permission",
    scope: true,
    params: idParams,
  },
  "orders.create": {
    method: "POST",
    path: "/api/orders",
    tag: "Orders",
    summary: "Create an order (pending)",
    description:
      SCOPED_CREATE +
      " Items: name, quantity, unit price (minor units). `billing`: `lifetime` (one-time, never expires), " +
      "`fixed_term` (one-time, access for the interval) or `recurring` (subscription renewing every interval). " +
      "Or `templateId` (one of the app's order templates) instead of items + billing + currency.",
    access: "permission",
    scope: true,
    body: orderSchema,
  },
  "orders.updatePayment": {
    method: "PATCH",
    path: "/api/orders/{id}/payment-status",
    tag: "Orders",
    summary: "Change an order's payment status",
    description:
      "pending → paid / failed; failed → paid / pending; paid → refunded. Paying a pending order starts it; " +
      "refunding cancels it.",
    access: "permission",
    scope: true,
    params: idParams,
    body: paymentStatusSchema,
  },
  "orders.updateOrderStatus": {
    method: "PATCH",
    path: "/api/orders/{id}/order-status",
    tag: "Orders",
    summary: "Change an order's status",
    description:
      "pending → active / cancelled; active → expired / cancelled; expired → active / cancelled; " +
      "cancelled → active. Active needs a paid order and starts a new period from now.",
    access: "permission",
    scope: true,
    params: idParams,
    body: orderStatusSchema,
  },
  "orders.renew": {
    method: "POST",
    path: "/api/orders/{id}/renew",
    tag: "Orders",
    summary:
      "Extend a paid subscription by one period (makes it active again if it expired)",
    access: "permission",
    scope: true,
    params: idParams,
  },
  "orders.checkout": {
    method: "POST",
    path: "/api/orders/{id}/checkout",
    tag: "Orders",
    summary: "Create a new Stripe payment link for an order",
    description:
      "A Stripe Checkout page for the order (subscription orders subscribe the customer). Replaces the " +
      "order's open link, if any. Payment methods are the ones enabled in the Stripe Dashboard. " +
      "When Stripe is configured, new orders get a link automatically.",
    access: "permission",
    scope: true,
    params: idParams,
  },
  "orders.delete": {
    method: "DELETE",
    path: "/api/orders/{id}",
    tag: "Orders",
    summary: "Delete a pending or cancelled order",
    access: "permission",
    scope: true,
    params: idParams,
  },

  // Order templates: an app's ready-made orders
  "orderTemplates.list": {
    method: "GET",
    path: "/api/order-templates",
    tag: "Order templates",
    summary: "List order templates",
    description: SCOPED_LIST + " `active=true` for the ones that can make orders.",
    access: "permission",
    scope: true,
    query: orderTemplatesQuery,
  },
  "orderTemplates.create": {
    method: "POST",
    path: "/api/order-templates",
    tag: "Order templates",
    summary: "Add an order template",
    description:
      SCOPED_CREATE +
      " `code` is what apps send to order it (unique in the app); price in minor units; optional Google Play product.",
    access: "permission",
    scope: true,
    body: orderTemplateSchema,
  },
  "orderTemplates.update": {
    method: "PUT",
    path: "/api/order-templates/{id}",
    tag: "Order templates",
    summary: "Change an order template",
    description: "Orders already made from it keep their details.",
    access: "permission",
    scope: true,
    params: idParams,
    body: orderTemplateUpdateSchema,
  },
  "orderTemplates.updateStatus": {
    method: "PATCH",
    path: "/api/order-templates/{id}/status",
    tag: "Order templates",
    summary: "Turn an order template on or off",
    description: "An inactive template can't make new orders.",
    access: "permission",
    scope: true,
    params: idParams,
    body: updateStatusSchema,
  },
  "orderTemplates.delete": {
    method: "DELETE",
    path: "/api/order-templates/{id}",
    tag: "Order templates",
    summary: "Delete an order template",
    description: "Orders made from it keep their details.",
    access: "permission",
    scope: true,
    params: idParams,
  },

  // Payments reported by Stripe (read only)
  "payments.list": {
    method: "GET",
    path: "/api/payments",
    tag: "Payments",
    summary: "List payments",
    description:
      SCOPED_LIST +
      " Or one order's with `orderId`; `search` matches order number or customer.",
    access: "permission",
    scope: true,
    query: paymentsQuery,
  },

  // Stripe (one account for every platform, from the environment)
  "stripe.webhook": {
    method: "POST",
    path: "/api/stripe/webhook",
    tag: "Stripe",
    summary: "Stripe webhook (called by Stripe)",
    description:
      "Verified with STRIPE_WEBHOOK_SECRET. Finds the order from Stripe's metadata (any platform), updates " +
      "it and records the payment — Checkout, subscription invoices and refunds.",
    access: "public",
  },

  // App API — called by a platform's apps (signed with the app secret), not by managers
  "appApi.user": {
    method: "POST",
    path: "/api/webhooks/user",
    tag: "App API",
    summary: "Sign a user in (or up) — returns access + refresh tokens",
    description:
      "Signs in the app's user with this email + password; an email the app doesn't have yet is signed up " +
      "(201, `created: true`). A user added in the dashboard sets their password on the first call. Returns " +
      "a 1-hour `accessToken` and a 30-day `refreshToken`." + SIGNED,
    access: "public",
    body: apiUserSchema,
  },
  "appApi.device": {
    method: "POST",
    path: "/api/webhooks/device",
    tag: "App API",
    summary: "Register the signed-in user's device",
    description:
      "Needs `Authorization: Bearer <accessToken>`. Registering the same `deviceUid` again returns it (200); " +
      "a new one counts against the user's allowed devices." + SIGNED,
    access: "public",
    body: apiDeviceSchema,
  },
  "appApi.order": {
    method: "POST",
    path: "/api/webhooks/order",
    tag: "App API",
    summary: "Create an order for the signed-in user — returns its payment link",
    description:
      "Needs `Authorization: Bearer <accessToken>`. One item: `itemName`, `amount` (e.g. \"9.99\"), optional " +
      "`quantity`. `billing`: `lifetime`, `fixed_term` or `recurring` (with `intervalUnit` + `intervalCount`). " +
      "Counts against the user's pending order limit. `payUrl` is the Stripe payment page." + SIGNED,
    access: "public",
    body: apiOrderSchema,
  },
  "appApi.verify": {
    method: "GET",
    path: "/api/webhooks/verify",
    tag: "App API",
    summary: "The signed-in user's orders: id, status, expiry",
    description:
      "Needs `Authorization: Bearer <accessToken>`; `email` must be the signed-in user's. Query parameters are " +
      "signed like a body. `expiresAt` null = never expires." + SIGNED,
    access: "public",
    query: apiVerifyQuery,
  },
  "appApi.refresh": {
    method: "POST",
    path: "/api/webhooks/refresh",
    tag: "App API",
    summary: "A new access token for a refresh token",
    description:
      "Returns a new 1-hour `accessToken`. When the refresh token has less than 7 days left it is replaced: " +
      "`refreshTokenRotated: true` and the new `refreshToken` (the old one stops working); otherwise " +
      "`refreshToken` is null — keep using yours." + SIGNED,
    access: "public",
    body: apiRefreshSchema,
  },

  // Google Play webhook: Real-time developer notifications (Pub/Sub push)
  "googlePlay.webhook": {
    method: "POST",
    path: "/api/google-play/webhook",
    tag: "Google Play",
    summary: "Google Play webhook (called by Pub/Sub)",
    description:
      "Verified with the push subscription's Google-signed token (audience GOOGLE_PLAY_PUSH_AUDIENCE). Re-reads " +
      "the purchase from Google: a new purchase pays the order the app named in the billing flow " +
      "(obfuscatedProfileId = order number, obfuscatedAccountId = user id); later ones update it — renewals, " +
      "grace period, on hold, expiry, cancel, refunds.",
    access: "public",
  },
} as const satisfies Record<string, EndpointDef>;

export type EndpointId = keyof typeof endpoints;

export const endpointIds = Object.keys(endpoints) as EndpointId[];

/** Endpoints that can be granted on a permission card. */
export const grantableEndpointIds = endpointIds.filter(
  (id) => endpoints[id].access === "permission",
);

// Fail fast on duplicate method + path or undeclared path params.
const seen = new Set<string>();
for (const id of endpointIds) {
  const def: EndpointDef = endpoints[id];
  const key = `${def.method} ${def.path}`;
  if (seen.has(key)) throw new Error(`Duplicate endpoint ${key}`);
  seen.add(key);
  for (const [, name] of def.path.matchAll(/\{(\w+)\}/g)) {
    if (!def.params?.shape[name])
      throw new Error(`${id}: path param {${name}} is not declared`);
  }
}

// --- Grants: permission cards store backend access as "METHOD /path" ---------------

/** "PATCH /api/managers/{id}/status" — how an endpoint is written on a permission card. */
export function endpointKey(id: EndpointId) {
  const def: EndpointDef = endpoints[id];
  return `${def.method} ${def.path}`;
}

const idByKey = new Map(endpointIds.map((id) => [endpointKey(id), id]));

export function endpointIdForKey(key: string): EndpointId | undefined {
  return idByKey.get(key);
}

/** Normalises a typed path: leading slash, no trailing slash, `:id` → `{id}`. */
export function normalizePath(path: string) {
  let p = path
    .trim()
    .replace(/\s+/g, "")
    .replace(/:(\w+)/g, "{$1}");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p;
}
