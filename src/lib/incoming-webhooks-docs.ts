// Developer documentation of the webhooks the payment providers call (Stripe, Google Play),
// shown on the Webhooks pages next to the App API. Keep in step with
// src/server/stripe-webhook.ts and src/server/google-play-sync.ts.

export const INCOMING_WEBHOOKS = ["stripe", "google-play"] as const;
export type IncomingWebhook = (typeof INCOMING_WEBHOOKS)[number];

export const isIncomingWebhook = (v: string): v is IncomingWebhook =>
  (INCOMING_WEBHOOKS as readonly string[]).includes(v);

export interface IncomingEvent {
  name: string;
  effect: string;
}

export interface IncomingDoc {
  key: IncomingWebhook;
  title: string;
  summary: string;
  path: string;
  caller: string;
  /** how a request is checked before anything is read */
  verification: string[];
  env: { name: string; description: string; example: string }[];
  events: IncomingEvent[];
  /** what a request looks like */
  sample: { label: string; headers: Record<string, string>; body: unknown; decoded?: unknown };
  responses: { status: number; when: string }[];
  setup: { title: string; steps: string[] }[];
  test: { title: string; steps: string[]; commands?: string[] }[];
  notes: string[];
}

export const INCOMING_DOCS: Record<IncomingWebhook, IncomingDoc> = {
  stripe: {
    key: "stripe",
    title: "Stripe webhook",
    summary:
      "Stripe calls it when a payment link is paid, fails or expires, when a subscription renews or ends, and when a payment is refunded. It finds the order from the payment's metadata (any platform), updates it, records the payment and queues the customer's email.",
    path: "/api/stripe/webhook",
    caller: "Stripe (one endpoint for every platform)",
    verification: [
      "The `Stripe-Signature` header is checked with `STRIPE_WEBHOOK_SECRET` before anything is read (HMAC-SHA256 over `timestamp.payload`, 5-minute tolerance).",
      "Each event id is handled once — Stripe can deliver an event twice.",
      "The objects are read from Stripe again (payment, invoice), so a late or out-of-order event can't move an order the wrong way.",
      "The order must match both `order_id` and `order_number` in the metadata — other environments sharing the Stripe account can't touch it.",
    ],
    env: [
      { name: "STRIPE_SECRET_KEY", description: "Stripe Dashboard → Developers → API keys.", example: "sk_test_…" },
      { name: "STRIPE_WEBHOOK_SECRET", description: "The endpoint's signing secret (or the one `stripe listen` prints).", example: "whsec_…" },
    ],
    events: [
      { name: "checkout.session.completed", effect: "One-time order paid → paid + active (period starts). Subscription order → linked to its Stripe subscription; paid by its first invoice." },
      { name: "checkout.session.async_payment_succeeded", effect: "A delayed method (bank debit…) went through → paid + active." },
      { name: "checkout.session.async_payment_failed", effect: "A delayed method failed → payment failed; a new link can be made." },
      { name: "checkout.session.expired", effect: "The payment link stopped working → the order's link is cleared." },
      { name: "invoice.paid", effect: "Subscription paid (first or renewal) → paid, active until the new period end (an expired order comes back)." },
      { name: "invoice.payment_failed", effect: "Renewal failed → payment failed; the order keeps its end date (the health cron expires it) and gets the invoice's pay link." },
      { name: "customer.subscription.deleted", effect: "Subscription ended → order cancelled." },
      { name: "charge.refunded", effect: "Payment (partly) refunded → payment updated; a fully refunded one-time order is cancelled." },
    ],
    sample: {
      label: "checkout.session.completed (shortened)",
      headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1761552000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd" },
      body: {
        id: "evt_1QabcXYZ",
        object: "event",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_a1b2c3",
            object: "checkout.session",
            mode: "payment",
            payment_status: "paid",
            payment_intent: "pi_3QabcXYZ",
            customer: "cus_Qabc",
            client_reference_id: "ORD-261027-K7EGQ7",
            metadata: { order_id: "42", order_number: "ORD-261027-K7EGQ7", platform_id: "bca86d22-…", app_id: "7" },
          },
        },
      },
    },
    responses: [
      { status: 200, when: "`{ received: true, result }` — result is handled, ignored (an event not used) or duplicate." },
      { status: 400, when: "STRIPE_SIGNATURE_INVALID — wrong or missing signature (Stripe shows it as failed)." },
      { status: 503, when: "STRIPE_NOT_CONFIGURED — the server has no Stripe keys." },
      { status: 500, when: "Something failed while updating — Stripe retries for up to 3 days." },
    ],
    setup: [
      {
        title: "Server",
        steps: [
          "Put `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the server's environment (`.env.local`) and restart it.",
          "Turn on the payment methods you want in Stripe Dashboard → Settings → Payment methods.",
        ],
      },
      {
        title: "Stripe Dashboard",
        steps: [
          "Developers → Webhooks → Add endpoint.",
          "Endpoint URL: `https://<your-domain>/api/stripe/webhook` (it must be reachable from the internet — a Cloudflare tunnel works; keep login pages like Cloudflare Access off this path).",
          "Select the 8 events listed on Docs.",
          "Copy the endpoint's Signing secret into `STRIPE_WEBHOOK_SECRET`.",
        ],
      },
    ],
    test: [
      {
        title: "On your computer, with the Stripe CLI",
        steps: [
          "Install the Stripe CLI (macOS: Homebrew; Windows: Scoop or the zip from GitHub) and run `stripe login`.",
          "Forward events to the local server and put the `whsec_…` it prints in `STRIPE_WEBHOOK_SECRET`.",
          "Create an order here, open its payment link and pay with the test card 4242 4242 4242 4242 (any future date, any CVC). The order becomes paid and the payment shows on the Payments page.",
        ],
        commands: [
          "stripe listen --forward-to localhost:3000/api/stripe/webhook",
          "stripe trigger checkout.session.expired",
        ],
      },
      {
        title: "From the Stripe Dashboard",
        steps: [
          "Developers → Webhooks → your endpoint shows every delivery with its response; Resend replays one.",
          "Events made by `stripe trigger` have no order metadata, so they come back `ignored` — use a real payment link to see an order change.",
        ],
      },
    ],
    notes: [
      "One URL for every platform: the order (from the payment's metadata) says which one.",
      "Payment methods on the payment page are the ones turned on in Stripe and fitting the order's currency, type and the customer's country.",
      "Test and live mode have separate keys and webhook secrets.",
    ],
  },

  "google-play": {
    key: "google-play",
    title: "Google Play webhook",
    summary:
      "Google Play's Real-time developer notifications, pushed by Google Cloud Pub/Sub when a purchase is made or changes: purchase, renewals, grace period, on hold, cancellations, expiry and refunds — Google Play's equivalent of the Stripe webhook. The purchase is read from Google again and its order follows it. The first notification of a purchase either creates the order (the billing flow named only the user: `obfuscatedAccountId` = user id — name from Play Console, price paid, base plan period) or pays an order made with /order (it also named `obfuscatedProfileId` = order number).",
    path: "/api/google-play/webhook",
    caller: "Google Cloud Pub/Sub push subscription (one endpoint for every platform)",
    verification: [
      "The push carries `Authorization: Bearer <Google-signed OIDC token>`; its signature (Google's keys), issuer and audience (`GOOGLE_PLAY_PUSH_AUDIENCE`) are checked, and the signing service account when `GOOGLE_PLAY_PUSH_EMAIL` is set.",
      "The notification only says *something* changed: the purchase is then read from the Google Play Developer API, so repeats or late arrivals are harmless.",
      "The package name picks the app (an app added with that Android app id).",
      "A purchase naming only a user creates the order for that user, if they're a user of the app; one delivered twice still makes one order.",
      "A new purchase pays the order named by `obfuscatedProfileId` only when `obfuscatedAccountId` is that order's user — another user's order can't be touched. A mismatch (wrong type, order already paid, a product other than the order template's Google Play product) is answered `ignored`, so Pub/Sub doesn't retry it.",
    ],
    env: [
      { name: "GOOGLE_PLAY_SERVICE_ACCOUNT", description: "The service account's JSON key (as is, or base64) — reads and acknowledges purchases, and reads products (name, base plan period) to create orders.", example: "{\"type\":\"service_account\",\"client_email\":\"play@my-project.iam.gserviceaccount.com\",…}" },
      { name: "GOOGLE_PLAY_PUSH_AUDIENCE", description: "The Audience set on the push subscription (usually the endpoint URL).", example: "https://your-domain/api/google-play/webhook" },
      { name: "GOOGLE_PLAY_PUSH_EMAIL", description: "The service account the push subscription signs as (recommended).", example: "pubsub-push@my-project.iam.gserviceaccount.com" },
    ],
    events: [
      { name: "SUBSCRIPTION_PURCHASED (4)", effect: "First notification. Only the user named: an order is created (product name, price paid, base plan period — renewing = subscription, prepaid = one-time for the period). Order named: that order is linked. Either way paid, active until the expiry, acknowledged." },
      { name: "SUBSCRIPTION_RENEWED (2) / RECOVERED (1) / RESTARTED (7)", effect: "Paid, active until the new expiry (an expired order comes back)." },
      { name: "SUBSCRIPTION_IN_GRACE_PERIOD (6)", effect: "Payment failed, still active until the grace period ends." },
      { name: "SUBSCRIPTION_ON_HOLD (5) / PAUSED (10)", effect: "Access ended → expired (paying again brings it back)." },
      { name: "SUBSCRIPTION_CANCELED (3)", effect: "Auto-renew off: stays active until the expiry, then expires." },
      { name: "SUBSCRIPTION_EXPIRED (13)", effect: "Expired." },
      { name: "SUBSCRIPTION_REVOKED (12) / voidedPurchaseNotification", effect: "Refunded → payment refunded, order cancelled." },
      { name: "ONE_TIME_PRODUCT_PURCHASED (1) / CANCELED (2)", effect: "Only the user named: a lifetime order is created (product name, default price). Order named: that order is paid. Then acknowledged / on cancel, cancelled." },
      { name: "SUBSCRIPTION_PENDING_PURCHASE_CANCELED (20)", effect: "A pending purchase was dropped → order cancelled." },
      { name: "testNotification", effect: "Answered `test` (Play Console → Send test notification)." },
    ],
    sample: {
      label: "Pub/Sub push",
      headers: { "Content-Type": "application/json", Authorization: "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6…" },
      body: {
        message: {
          data: "eyJ2ZXJzaW9uIjoiMS4wIiwicGFja2FnZU5hbWUiOiJjb20uZXhhbXBsZS5zaG9wIiwiZXZlbnRUaW1lTWlsbGlzIjoiMTc2MTU1MjAwMDAwMCIsInN1YnNjcmlwdGlvbk5vdGlmaWNhdGlvbiI6eyJ2ZXJzaW9uIjoiMS4wIiwibm90aWZpY2F0aW9uVHlwZSI6MiwicHVyY2hhc2VUb2tlbiI6Ii4uLiIsInN1YnNjcmlwdGlvbklkIjoicHJvX21vbnRobHkifX0=",
          messageId: "136969346945",
          publishTime: "2026-10-27T10:00:00.000Z",
        },
        subscription: "projects/my-project/subscriptions/play-rtdn-push",
      },
      decoded: {
        version: "1.0",
        packageName: "com.example.shop",
        eventTimeMillis: "1761552000000",
        subscriptionNotification: { version: "1.0", notificationType: 2, purchaseToken: "...", subscriptionId: "pro_monthly" },
      },
    },
    responses: [
      { status: 200, when: "`{ received: true, result }` — handled, ignored (another app, no order named in the billing flow, or a mismatch) or test. Pub/Sub stops retrying." },
      { status: 401, when: "GOOGLE_PUSH_UNAUTHORIZED — no / wrong push token." },
      { status: 503, when: "GOOGLE_PLAY_NOT_CONFIGURED — the server isn't set up for Google Play." },
      { status: 500, when: "Something failed (e.g. Google's API) — Pub/Sub retries with backoff." },
    ],
    setup: [
      {
        title: "Google Cloud",
        steps: [
          "Create (or pick) a project and enable the Google Play Android Developer API.",
          "Create a service account and a JSON key → put it in `GOOGLE_PLAY_SERVICE_ACCOUNT`.",
          "Pub/Sub → create a topic (e.g. `play-rtdn`) and grant `google-play-developer-notifications@system.gserviceaccount.com` the Pub/Sub Publisher role on it.",
          "Create a Push subscription on the topic: endpoint `https://<your-domain>/api/google-play/webhook`, Enable authentication with a service account (→ `GOOGLE_PLAY_PUSH_EMAIL`) and an Audience (→ `GOOGLE_PLAY_PUSH_AUDIENCE`).",
        ],
      },
      {
        title: "Play Console",
        steps: [
          "Users and permissions → invite the service account's email; give it access to the app with View app information, View financial data, and Manage orders and subscriptions.",
          "Your app → Monetize with Play → Monetization setup → Real-time developer notifications: the topic `projects/<project>/topics/play-rtdn`, notifications for subscriptions and one-time products, then Save.",
          "Create the products / subscriptions the app sells (their ids are the `productId` the app sends).",
        ],
      },
      {
        title: "Server and app",
        steps: [
          "Put the three `GOOGLE_PLAY_*` values in the environment and restart.",
          "Add the Android app on the Apps page with its package name as the app id.",
          "Simplest: in the app, launch the Play billing flow with `setObfuscatedAccountId(user.id)` (the `user.id` from /user). That's all — this webhook creates the order, and the app checks it with /verify. No template or /order call needed: the name, period and price come from Play Console.",
          "Or, to have the order before payment (dashboard sees it pending, pending order limit applies): create it with /order (`createCheckout` \"false\", e.g. from a template) and also pass `setObfuscatedProfileId(orderId)`.",
        ],
      },
    ],
    test: [
      {
        title: "In the Android app (Play Billing Library)",
        steps: [
          "Simplest — name only the user; this webhook creates the order:",
        ],
        commands: [
          `val params = BillingFlowParams.newBuilder()
    .setProductDetailsParamsList(listOf(
        BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)
            .setOfferToken(offerToken) // subscriptions only
            .build()))
    .setObfuscatedAccountId(user.id.toString()) // "user.id" from /api/webhooks/user
    .build()
billingClient.launchBillingFlow(activity, params)
// then check access with /api/webhooks/verify — don't acknowledge in the app`,
        ],
      },
      {
        title: "Or with an order made first",
        steps: [
          "Create the order with /order (`createCheckout` \"false\"), then name it in the billing flow too:",
        ],
        commands: [
          `val params = BillingFlowParams.newBuilder()
    .setProductDetailsParamsList(listOf(
        BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(productDetails)
            .setOfferToken(offerToken) // subscriptions only
            .build()))
    .setObfuscatedAccountId(user.id.toString()) // "user.id" from /api/webhooks/user
    .setObfuscatedProfileId(order.orderId)      // "ORD-…" from /api/webhooks/order
    .build()
billingClient.launchBillingFlow(activity, params)
// don't acknowledge in the app — the server does it after checking with Google`,
        ],
      },
      {
        title: "Play Console test notification",
        steps: [
          "Monetization setup → Real-time developer notifications → Send test notification. It arrives as `testNotification` and is answered `test` — proof the push, token and audience work.",
        ],
      },
      {
        title: "License testers",
        steps: [
          "Setup → License testing: add test Google accounts. Their purchases are free, renew every few minutes and show as Test on the Payments page.",
          "Buy in an internal-testing build (with the order named in the billing flow), then watch the purchase, renewals and cancellations update the order.",
        ],
      },
      {
        title: "Pub/Sub",
        steps: [
          "The push subscription's Metrics show deliveries and errors; a 401 means the audience or service account doesn't match the server's settings.",
        ],
      },
    ],
    notes: [
      "Google Play policy generally requires Play Billing for digital goods sold inside apps installed from Google Play — use Stripe on the web and other platforms; both land in the same orders.",
      "A purchase is acknowledged by the server; the app must not acknowledge it (Google refunds purchases not acknowledged within 3 days).",
      "Cancelling a subscription order in the dashboard also cancels it in Google Play (no more renewals; Google needs the service account settings, else the cancel is refused).",
      "Each renewal keeps the same order (new end date, a new payment) and sends the customer a “subscription renewed” email.",
      "Prices come from Play Console; a subscription's payment uses Google's price when it's given, otherwise the order's total.",
    ],
  },
};
