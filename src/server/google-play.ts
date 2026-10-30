import "server-only";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { PAY_MODES, platformMode, playSettings, type PayMode } from "./pay-mode";
import { ApiError } from "./errors";

// Google Play Billing — one Google Cloud service account for every platform (environment),
// like Stripe. Apps sell in-app products / subscriptions set up in Play Console; the server
// checks every purchase with the Google Play Developer API (androidpublisher v3) and keeps it
// up to date from the Google Play webhook — Real-time developer notifications pushed by
// Pub/Sub (see google-play-sync.ts).

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/** subscriptionsv2.get (only what is used). */
export interface PlaySubscription {
  subscriptionState: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  startTime?: string;
  linkedPurchaseToken?: string;
  testPurchase?: object;
  /** what the app passed to the billing flow (setObfuscatedAccountId / ProfileId) */
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string; obfuscatedExternalProfileId?: string };
  lineItems?: {
    productId: string;
    expiryTime?: string;
    offerDetails?: { basePlanId?: string };
    autoRenewingPlan?: { recurringPrice?: { currencyCode: string; units?: string; nanos?: number } };
  }[];
}

/** purchases.products.get (only what is used). */
export interface PlayProduct {
  /** 0 purchased, 1 cancelled, 2 pending */
  purchaseState: number;
  /** 0 not yet, 1 acknowledged */
  acknowledgementState: number;
  orderId?: string;
  purchaseTimeMillis?: string;
  /** 0 = a test purchase (license tester) */
  purchaseType?: number;
  /** what the app passed to the billing flow (setObfuscatedAccountId / ProfileId) */
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
}

/** monetization.subscriptions.get: a subscription as set up in Play Console (only what is used). */
export interface PlaySubscriptionProduct {
  productId: string;
  listings?: { languageCode: string; title: string }[];
  basePlans?: {
    basePlanId: string;
    /** renews: ISO 8601 period, e.g. "P1M" */
    autoRenewingBasePlanType?: { billingPeriodDuration: string };
    /** paid once for a period, doesn't renew */
    prepaidBasePlanType?: { billingPeriodDuration: string };
  }[];
}

/** inappproducts.get: a one-time product as set up in Play Console (only what is used). */
export interface PlayInappProduct {
  sku: string;
  defaultLanguage?: string;
  listings?: Record<string, { title: string }>;
  defaultPrice?: { priceMicros: string; currency: string };
}

/** What the server asks Google — a stub can stand in for it in tests. */
export interface PlayClient {
  getSubscriptionProduct(packageName: string, productId: string): Promise<PlaySubscriptionProduct>;
  getInappProduct(packageName: string, sku: string): Promise<PlayInappProduct>;
  getSubscription(packageName: string, token: string): Promise<PlaySubscription>;
  getProduct(packageName: string, productId: string, token: string): Promise<PlayProduct>;
  acknowledgeSubscription(packageName: string, productId: string, token: string): Promise<void>;
  acknowledgeProduct(packageName: string, productId: string, token: string): Promise<void>;
  /** stops renewals; the customer keeps what they paid for until its end */
  cancelSubscription(packageName: string, productId: string, token: string): Promise<void>;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** The mode's service account key (GOOGLE_PLAY_SERVICE_ACCOUNT[_TEST]): its JSON, as is or base64. */
function serviceAccount(mode: PayMode): ServiceAccount | null {
  const raw = playSettings(mode).serviceAccount;
  if (!raw) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(text) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT is not a service account key");
  return parsed;
}

const globalForPlay = globalThis as unknown as { playTokens?: Map<string, { value: string; expiresAt: number }> };

/** An OAuth access token for the service account (cached per account until shortly before it ends). */
async function accessToken(account: ServiceAccount) {
  const tokens = (globalForPlay.playTokens ??= new Map());
  const cached = tokens.get(account.client_email);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(await importPKCS8(account.private_key, "RS256"));
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new ApiError(502, "GOOGLE_PLAY_ERROR", [body.error_description ?? `token request failed (${res.status})`]);
  }
  tokens.set(account.client_email, { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

async function call<T>(account: ServiceAccount, method: "GET" | "POST", url: string): Promise<T> {
  const res = await fetch(url, { method, headers: { authorization: `Bearer ${await accessToken(account)}` } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (res.status === 404 || res.status === 410) throw new ApiError(400, "GOOGLE_PLAY_PURCHASE_INVALID");
  if (!res.ok) {
    throw new ApiError(502, "GOOGLE_PLAY_ERROR", [(body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`]);
  }
  return body as T;
}

/** The platform's Google Play client (test or normal account), or null when it isn't set. */
export async function playClient(platformId: string): Promise<PlayClient | null> {
  return playClientFor(await platformMode(platformId));
}

/** The Google Play client of a mode's account, or null when it isn't set. */
export function playClientFor(mode: PayMode): PlayClient | null {
  const account = serviceAccount(mode);
  if (!account) return null;
  const enc = encodeURIComponent;
  return {
    getSubscriptionProduct: (pkg, productId) =>
      call(account, "GET", `${API}/${enc(pkg)}/subscriptions/${enc(productId)}`),
    getInappProduct: (pkg, sku) => call(account, "GET", `${API}/${enc(pkg)}/inappproducts/${enc(sku)}`),
    getSubscription: (pkg, token) =>
      call(account, "GET", `${API}/${enc(pkg)}/purchases/subscriptionsv2/tokens/${enc(token)}`),
    getProduct: (pkg, productId, token) =>
      call(account, "GET", `${API}/${enc(pkg)}/purchases/products/${enc(productId)}/tokens/${enc(token)}`),
    acknowledgeSubscription: (pkg, productId, token) =>
      call(account, "POST", `${API}/${enc(pkg)}/purchases/subscriptions/${enc(productId)}/tokens/${enc(token)}:acknowledge`),
    cancelSubscription: (pkg, productId, token) =>
      call(account, "POST", `${API}/${enc(pkg)}/purchases/subscriptions/${enc(productId)}/tokens/${enc(token)}:cancel`),
    acknowledgeProduct: (pkg, productId, token) =>
      call(account, "POST", `${API}/${enc(pkg)}/purchases/products/${enc(productId)}/tokens/${enc(token)}:acknowledge`),
  };
}

// --- Pub/Sub push authentication ---------------------------------------------------------

export const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/**
 * A push request from Pub/Sub carries a Google-signed OIDC token (push subscription →
 * Authentication). Its audience and sender must be one mode's GOOGLE_PLAY_PUSH_AUDIENCE /
 * GOOGLE_PLAY_PUSH_EMAIL (or the *_TEST pair): that mode is returned, and the notification
 * may only touch that mode's platforms.
 */
export async function verifyPushRequest(req: Request): Promise<PayMode> {
  const accounts = PAY_MODES.map((mode) => ({ mode, ...playSettings(mode) })).filter(
    // both are needed: without the sender, any Google service account could mint a token
    // with this audience
    (a) => a.pushAudience && a.pushEmail,
  );
  if (!accounts.length) throw new ApiError(503, "GOOGLE_PLAY_NOT_CONFIGURED");
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new ApiError(401, "GOOGLE_PUSH_UNAUTHORIZED");
  try {
    const { payload } = await jwtVerify<{ email?: string; email_verified?: boolean }>(token, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: accounts.map((a) => a.pushAudience!),
    });
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const match = accounts.find(
      (a) => audiences.includes(a.pushAudience) && payload.email === a.pushEmail && payload.email_verified === true,
    );
    if (!match) throw new Error("wrong account");
    return match.mode;
  } catch {
    throw new ApiError(401, "GOOGLE_PUSH_UNAUTHORIZED");
  }
}
