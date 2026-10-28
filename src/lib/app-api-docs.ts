// Developer documentation of the App API (/api/webhooks/*), shown on the Webhooks pages and
// used by their playground. Written in English like the API itself; keep it in step with
// src/server/schemas.ts (api*Schema) and the route handlers.

export const APP_API_ENDPOINTS = ["user", "device", "order", "verify", "refresh"] as const;
export type AppApiEndpoint = (typeof APP_API_ENDPOINTS)[number];

export const isAppApiEndpoint = (v: string): v is AppApiEndpoint =>
  (APP_API_ENDPOINTS as readonly string[]).includes(v);

export interface ApiParam {
  name: string;
  /** "if" = required in some cases (see the description) */
  required: boolean | "if";
  description: string;
  /** sample value the playground starts with */
  example: string;
  /** the only values allowed */
  options?: readonly string[];
  /** hide the value in the playground (passwords) */
  secret?: boolean;
}

export interface ApiError {
  status: number;
  code: string;
  when: string;
}

export interface ApiDoc {
  key: AppApiEndpoint;
  method: "GET" | "POST";
  path: string;
  title: string;
  summary: string;
  /** needs `Authorization: Bearer <accessToken>` */
  token: boolean;
  params: ApiParam[];
  responses: { status: number; label: string; example: unknown }[];
  errors: ApiError[];
  notes: string[];
}

/** Sent with every request; the playground fills them in. */
export const SIGNED_PARAMS: ApiParam[] = [
  {
    name: "appKey",
    required: true,
    description: "Your app's key (Apps → View). Identifies the app.",
    example: "ak_1f0c9e…",
  },
  {
    name: "timestamp",
    required: true,
    description: "Current Unix time in seconds. Must be within 5 minutes of the server's clock.",
    example: "1767225600",
  },
  {
    name: "signature",
    required: true,
    description: "HMAC-SHA256 of the sorted parameters with your app secret, lowercase hex (see Guide).",
    example: "9b1e…64 hex characters",
  },
];

/** Errors any App API request can get. */
export const COMMON_ERRORS: ApiError[] = [
  { status: 400, code: "VALIDATION_ERROR", when: "A parameter is missing, not a string, unknown, or not valid. `details` lists them." },
  { status: 401, code: "INVALID_APP_KEY", when: "No app has this `appKey`." },
  { status: 401, code: "REQUEST_EXPIRED", when: "`timestamp` is missing or more than 5 minutes off." },
  { status: 401, code: "INVALID_SIGNATURE", when: "`signature` doesn't match the parameters signed with the app secret." },
  { status: 403, code: "APP_UNAVAILABLE", when: "The app's platform is inactive." },
];

const TOKEN_ERRORS: ApiError[] = [
  { status: 401, code: "INVALID_TOKEN", when: "No `Authorization: Bearer` token, or it expired (1 hour), was changed, or is for another app. Refresh it, or sign in again." },
  { status: 403, code: "ACCOUNT_DISABLED", when: "The user was turned off in the dashboard." },
];

const SAMPLE_EMAIL = "demo.user@example.com";
const SAMPLE_TOKENS = {
  accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJhcHAiOjEsInR5cCI6ImFjY2VzcyIsInN1YiI6IjQyIn0.…",
  accessTokenExpiresAt: "2026-10-26T17:00:00.000Z",
  refreshToken: "rt_Xq3v…",
  refreshTokenExpiresAt: "2026-11-25T16:00:00.000Z",
};

export const APP_API_DOCS: Record<AppApiEndpoint, ApiDoc> = {
  user: {
    key: "user",
    method: "POST",
    path: "/api/webhooks/user",
    title: "Sign in user",
    summary:
      "Signs your app's user in with email + password, or with the Google account they picked on the device (Sign in with Google), and returns their tokens. An email your app doesn't have yet is signed up.",
    token: false,
    params: [
      { name: "email", required: "if", description: "The user's email (not case sensitive). With `password`; not with `googleIdToken`.", example: SAMPLE_EMAIL },
      { name: "password", required: "if", description: "At least 8 characters. With `email`.", example: "Demo@12345", secret: true },
      { name: "googleIdToken", required: "if", description: "Sign in with Google instead of email + password: the ID token Google gave the app for the account the user picked (`idToken` from Google Sign-In, requested with the Web client ID set in this app's App config → Sign in with Google). The email comes from Google, already verified.", example: "", secret: true },
    ],
    responses: [
      {
        status: 200,
        label: "Signed in",
        example: { user: { id: 42, name: SAMPLE_EMAIL, email: SAMPLE_EMAIL }, created: false, ...SAMPLE_TOKENS },
      },
      {
        status: 201,
        label: "Signed up (new email)",
        example: { user: { id: 43, name: SAMPLE_EMAIL, email: SAMPLE_EMAIL }, created: true, ...SAMPLE_TOKENS },
      },
    ],
    errors: [
      { status: 401, code: "APP_USER_LOGIN_FAILED", when: "Wrong password for this email, or the email belongs to a different Google account." },
      { status: 401, code: "APP_USER_USE_GOOGLE", when: "Email + password for a user who signs in with Google (they have no password)." },
      { status: 401, code: "GOOGLE_TOKEN_INVALID", when: "`googleIdToken` isn't a valid, unexpired Google ID token issued for one of **this app's** client IDs (App config), or its email isn't verified — a token another app received is refused." },
      { status: 503, code: "GOOGLE_SIGNIN_NOT_CONFIGURED", when: "This app has no Google client ID in App config (Sign in with Google)." },
      { status: 403, code: "ACCOUNT_DISABLED", when: "The user was turned off in the dashboard." },
      { status: 429, code: "TOO_MANY_ATTEMPTS", when: "More than 10 tries for this email in 15 minutes." },
    ],
    notes: [
      "`accessToken` works for 1 hour — send it as `Authorization: Bearer <accessToken>` to /device, /order and /verify.",
      "`refreshToken` works for 30 days — use it with /refresh to get a new access token without asking for the password again.",
      "A user added in the dashboard (no password yet) sets their password with their first call — or links their Google account.",
      "Sign in with Google: no password and no email check — the first sign-in with a Google account creates the user (name and email from Google). The same email signed up with a password links that Google account.",
      "Store both tokens securely on the device (Keychain / Keystore), never in plain files.",
    ],
  },

  device: {
    key: "device",
    method: "POST",
    path: "/api/webhooks/device",
    title: "Register device",
    summary: "Registers the signed-in user's device. Each user may have as many active devices as allowed in the dashboard (default 1).",
    token: true,
    params: [
      { name: "deviceUid", required: true, description: "Your stable id for this device (unique within the app).", example: "demo-device-001" },
      { name: "os", required: true, description: "The device's system.", example: "android", options: ["android", "ios", "web", "windows", "macos", "linux", "other"] },
      { name: "fingerprint", required: false, description: "What your app computes from the hardware / browser.", example: "fp_9f2c1e7a" },
      { name: "model", required: false, description: "Device model, e.g. Pixel 9.", example: "Pixel 9" },
    ],
    responses: [
      { status: 201, label: "Registered", example: { device: { deviceId: "demo-device-001", status: "active" }, created: true } },
      { status: 200, label: "Already this user's (details updated)", example: { device: { deviceId: "demo-device-001", status: "active" }, created: false } },
    ],
    errors: [
      ...TOKEN_ERRORS,
      { status: 409, code: "DEVICE_TAKEN", when: "This `deviceUid` belongs to another user of the app." },
      { status: 409, code: "DEVICE_LIMIT_REACHED", when: "The user already has as many active devices as allowed." },
    ],
    notes: [
      "Call it on every sign in — registering the same `deviceUid` again is safe and returns it.",
      "`status` is `inactive` when the device was turned off in the dashboard: treat it as not allowed.",
    ],
  },

  order: {
    key: "order",
    method: "POST",
    path: "/api/webhooks/order",
    title: "Create order",
    summary: "Creates an order for the signed-in user and returns its Stripe payment link. The order becomes active when Stripe reports the payment.",
    token: true,
    params: [
      { name: "template", required: "if", description: "An order template's code (Order templates page), e.g. \"pro_monthly\" — the item, price and billing come from the server. Send this instead of itemName / amount / currency / billing / interval / quantity (recommended for mobile apps: the price can't be changed by the app).", example: "" },
      { name: "itemName", required: "if", description: "Custom order (no `template`, and only when App config allows custom orders): what the user buys.", example: "Pro plan" },
      { name: "amount", required: "if", description: "Custom order: price of one item in the currency's units, e.g. \"9.99\" (no thousands separators).", example: "9.99" },
      { name: "currency", required: "if", description: "Custom order: currency of the amount.", example: "USD", options: ["USD", "EUR", "GBP", "LKR", "INR", "AUD", "CAD", "SGD", "JPY"] },
      { name: "billing", required: "if", description: "Custom order — lifetime: pay once, never expires · fixed_term: pay once, access for the interval · recurring: subscription renewing every interval.", example: "recurring", options: ["lifetime", "fixed_term", "recurring"] },
      { name: "intervalUnit", required: "if", description: "Needed for fixed_term and recurring; not allowed for lifetime.", example: "month", options: ["day", "week", "month", "year"] },
      { name: "intervalCount", required: "if", description: "How many units (1–365). Needed for fixed_term and recurring.", example: "1" },
      { name: "quantity", required: false, description: "Custom order: 1–1000, default 1.", example: "1" },
      { name: "note", required: false, description: "Shown on the order in the dashboard (max 500).", example: "Created from the playground" },
      { name: "createCheckout", required: false, description: "\"true\" (default): the order gets a Stripe payment link (`payUrl`). \"false\": no link — pay it with Google Play in the app (the Google Play webhook pays the order).", example: "true", options: ["true", "false"] },
    ],
    responses: [
      {
        status: 201,
        label: "Created",
        example: {
          order: {
            orderId: "ORD-261026-K7EGQ7",
            paymentStatus: "pending",
            status: "pending",
            payUrl: "https://checkout.stripe.com/c/pay/cs_test_…",
            payUrlExpiresAt: "2026-10-27T16:00:00.000Z",
          },
          payUrlError: null,
        },
      },
    ],
    errors: [
      ...TOKEN_ERRORS,
      { status: 409, code: "PENDING_ORDER_LIMIT", when: "The user already has as many unpaid orders as allowed (default 3)." },
      { status: 400, code: "INVALID_TEMPLATE", when: "The app has no template with this code." },
      { status: 409, code: "TEMPLATE_INACTIVE", when: "The template is turned off." },
      { status: 403, code: "CUSTOM_ORDERS_OFF", when: "A custom order (no `template`) while the app doesn't allow them — App config → Custom App API orders (off by default)." },
    ],
    notes: [
      "Order from a template (`template`: its code) whenever you can: the price lives on the server, so a modified app can't change it. Custom orders (itemName + amount…) stay possible.",
      "Open `payUrl` for the user (browser / in-app browser). It works for 24 hours.",
      "Android app paying with Google Play Billing: /order isn't needed — start the Play billing flow with `setObfuscatedAccountId(user.id)` (the `user.id` from /user) and the Google Play webhook creates the order from the purchase. To have the order before payment instead, call /order with `createCheckout` \"false\" and also pass `setObfuscatedProfileId(orderId)`. Both ways (Stripe, Google Play) end in the same orders, /verify and emails.",
      "`payUrl` is null when Stripe isn't set up or refused the order; `payUrlError` says why. The order is still created.",
      "Don't trust the redirect back from the payment page — check the order with /verify.",
    ],
  },

  verify: {
    key: "verify",
    method: "GET",
    path: "/api/webhooks/verify",
    title: "Verify orders",
    summary: "The signed-in user's orders in your app — what to check before giving access.",
    token: true,
    params: [
      { name: "email", required: true, description: "The signed-in user's email (another user's is refused).", example: SAMPLE_EMAIL },
    ],
    responses: [
      {
        status: 200,
        label: "Orders, newest first",
        example: {
          email: SAMPLE_EMAIL,
          orders: [
            { orderId: "ORD-261026-K7EGQ7", status: "active", expiresAt: "2026-11-26T10:00:00.000Z", template: "pro_monthly" },
            { orderId: "ORD-261001-AB12CD", status: "expired", expiresAt: "2026-10-01T10:00:00.000Z", template: "pro_monthly" },
            { orderId: "ORD-260901-ZX98YW", status: "active", expiresAt: null, template: "lifetime" },
          ],
        },
      },
    ],
    errors: [...TOKEN_ERRORS, { status: 403, code: "FORBIDDEN", when: "`email` isn't the signed-in user's." }],
    notes: [
      "GET: the parameters go in the query string and are signed the same way.",
      "`status`: pending (not paid yet), active (give access), expired, cancelled.",
      "`expiresAt` null = never expires (lifetime).",
      "`template`: the order template's code — which plan was bought (null for a custom order). Check it when your app sells more than one plan.",
      "Give access while there is an active order whose `expiresAt` is null or in the future.",
    ],
  },

  refresh: {
    key: "refresh",
    method: "POST",
    path: "/api/webhooks/refresh",
    title: "Refresh token",
    summary: "A new 1-hour access token for a refresh token. Call it when a request returns INVALID_TOKEN.",
    token: false,
    params: [
      { name: "refreshToken", required: true, description: "The refreshToken from /user (or the latest one /refresh returned).", example: "rt_…" },
    ],
    responses: [
      {
        status: 200,
        label: "Refresh token kept",
        example: {
          accessToken: SAMPLE_TOKENS.accessToken,
          accessTokenExpiresAt: SAMPLE_TOKENS.accessTokenExpiresAt,
          refreshToken: null,
          refreshTokenExpiresAt: "2026-11-25T16:00:00.000Z",
          refreshTokenRotated: false,
        },
      },
      {
        status: 200,
        label: "Refresh token replaced (under 7 days left)",
        example: {
          accessToken: SAMPLE_TOKENS.accessToken,
          accessTokenExpiresAt: SAMPLE_TOKENS.accessTokenExpiresAt,
          refreshToken: "rt_New…",
          refreshTokenExpiresAt: "2026-12-20T16:00:00.000Z",
          refreshTokenRotated: true,
        },
      },
    ],
    errors: [
      { status: 401, code: "INVALID_REFRESH_TOKEN", when: "Unknown, expired, for another app, or already replaced — sign in again with /user." },
      { status: 403, code: "ACCOUNT_DISABLED", when: "The user was turned off in the dashboard." },
    ],
    notes: [
      "When `refreshTokenRotated` is true, save the new `refreshToken` — the old one no longer works.",
      "When it's false, `refreshToken` is null: keep using the one you have.",
    ],
  },
};

/** The text that is signed: parameters (all but `signature`) sorted by name, `a=1&b=2`. */
export function canonicalString(params: Record<string, string | undefined>) {
  return Object.keys(params)
    .filter((k) => k !== "signature" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}
