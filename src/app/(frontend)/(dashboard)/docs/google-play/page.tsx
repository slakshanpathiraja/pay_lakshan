"use client";

import {
  Bullets,
  Callout,
  CodeBlock,
  DocTable,
  FlowDiagram,
  Guide,
  Rich,
  StateDiagram,
  Steps,
  Sub,
} from "@/components/app/guide";
import { INCOMING_DOCS } from "@/lib/incoming-webhooks-docs";

const play = INCOMING_DOCS["google-play"];

const KOTLIN_SIMPLE = `// 1. the product from Play Console
val product = QueryProductDetailsParams.Product.newBuilder()
    .setProductId("pro_monthly")
    .setProductType(BillingClient.ProductType.SUBS) // INAPP for a one-time product
    .build()
billingClient.queryProductDetailsAsync(
    QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
) { _, result ->
    val details = result.productDetailsList.first()
    val offerToken = details.subscriptionOfferDetails?.first()?.offerToken // subscriptions only

    // 2. the purchase sheet, naming the user (user.id from /api/webhooks/user)
    val params = BillingFlowParams.newBuilder()
        .setProductDetailsParamsList(listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .apply { offerToken?.let { setOfferToken(it) } }
                .build()))
        .setObfuscatedAccountId(user.id.toString())
        .build()
    billingClient.launchBillingFlow(activity, params)
}

// 3. after the purchase: don't acknowledge here (the server does) — ask /api/webhooks/verify`;

const KOTLIN_ORDER_FIRST = `// the order first: POST /api/webhooks/order with template + createCheckout "false"
// → order.orderId, e.g. "ORD-261027-K7EGQ7"
val params = BillingFlowParams.newBuilder()
    .setProductDetailsParamsList(listOf(productDetailsParams))
    .setObfuscatedAccountId(user.id.toString())
    .setObfuscatedProfileId(order.orderId)   // pays this order
    .build()
billingClient.launchBillingFlow(activity, params)`;

const VERIFY = `// GET /api/webhooks/verify (signed, Bearer token)
{
  "email": "customer@example.com",
  "orders": [
    { "orderId": "ORD-261027-AB12CD", "status": "active", "expiresAt": "2026-11-27T10:00:00.000Z" }
  ]
}`;

/** Docs → Google Play: Play Billing purchases in Android apps, end to end. Open to every member. */
export default function GooglePlayGuidePage() {
  return (
    <Guide
      title="Google Play payments guide"
      summary="How Android apps sell with Google Play Billing and how those purchases become orders here — created, renewed, expired and refunded by the Google Play webhook. One Google Cloud service account serves every platform."
      sections={[
        {
          id: "overview",
          title: "Overview",
          body: (
            <>
              <Bullets
                items={[
                  "Products and prices are set up in **Play Console**; the customer pays inside the Android app with Google Play.",
                  "Google tells this server about every purchase and change through **Pub/Sub**, which calls the **Google Play webhook** (`/api/google-play/webhook`).",
                  "The webhook reads the purchase from Google, then **creates the order** (or pays the one you made), records the payment, acknowledges the purchase and emails the customer.",
                  "Your app checks access with `/verify` — the same as for Stripe orders.",
                ]}
              />
              <Callout tone="warn">
                <p>
                  <Rich text="Google Play policy generally requires Play Billing for digital goods sold inside apps installed from Google Play. Use Stripe on the web and other platforms — both end in the same orders." />
                </p>
              </Callout>
            </>
          ),
        },
        {
          id: "flow",
          title: "How a purchase works (simplest)",
          description: "The app names only the user; the webhook creates the order. No template or `/order` call needed.",
          body: (
            <FlowDiagram
              steps={[
                { actor: "app", title: "App starts the Google Play purchase", detail: "`setObfuscatedAccountId(user.id)`" },
                { actor: "customer", title: "Customer pays in Google Play", detail: "Google's purchase sheet" },
                { actor: "google", title: "Pub/Sub calls `/api/google-play/webhook`", detail: "Google says: a purchase was made" },
                { actor: "server", title: "Server reads the purchase and the product from Google", detail: "creates the order — name, price paid, period — paid + active, acknowledged" },
                { actor: "app", title: "App calls `GET /api/webhooks/verify`", detail: "an `active` order = access" },
              ]}
              footer="Renewals, grace period, on hold, expiry and refunds: Google calls step 3 again and the order follows."
            />
          ),
        },
        {
          id: "order-first",
          title: "Or: create the order first",
          description: "When you want the order to exist before payment (pending in the dashboard, pending order limit, from a template).",
          body: (
            <>
              <FlowDiagram
                steps={[
                  { actor: "app", title: "App calls `POST /api/webhooks/order`", detail: "`template` + `createCheckout` \"false\" → `orderId`" },
                  { actor: "app", title: "App starts the Google Play purchase", detail: "`setObfuscatedProfileId(orderId)` + `setObfuscatedAccountId(user.id)`" },
                  { actor: "customer", title: "Customer pays in Google Play" },
                  { actor: "google", title: "Pub/Sub calls `/api/google-play/webhook`", detail: "pays that order — the user and the template's Play product must match" },
                  { actor: "app", title: "App calls `GET /api/webhooks/verify`" },
                ]}
              />
              <DocTable
                head={["", "Simplest (user only)", "Order first"]}
                rows={[
                  ["Requests from the app", "None besides `/verify`", "`/order` before the purchase"],
                  ["Order exists", "After payment", "Before payment (pending)"],
                  ["Name, price, period from", "Play Console / the purchase", "The order template"],
                  ["Pending order limit", "Not used", "Applies"],
                ]}
              />
            </>
          ),
        },
        {
          id: "mapping",
          title: "What the webhook puts in a new order",
          body: (
            <DocTable
              head={["Order", "From Google"]}
              rows={[
                ["User", "`obfuscatedAccountId` — must be a user of the app with that package name"],
                ["Item name", "The product's title in Play Console (English when there is one)"],
                ["Price and currency", "What the customer paid (subscriptions); the product's default price (one-time products)"],
                ["Type and period", "Base plan: auto-renewing → subscription (`P1M` = every month, `P1Y` = every year); prepaid → one-time for that period. One-time product → lifetime"],
                ["Status", "Paid + active until Google's expiry; the purchase is acknowledged"],
                ["Template", "Linked when the app has an order template with that Google Play product (for its order count)"],
                ["Note", "“Bought in Google Play”"],
              ]}
            />
          ),
        },
        {
          id: "lifecycle",
          title: "Order status over time",
          body: (
            <>
              <StateDiagram
                moves={[
                  { from: "pending", to: "active", when: "Purchased (a new order is created already active)" },
                  { from: "active", to: "active", when: "`SUBSCRIPTION_RENEWED` — the end date moves forward, the renewal is recorded as a payment and the customer gets a “subscription renewed” email; a grace period keeps it active with the payment `failed`" },
                  { from: "active", to: "expired", when: "`ON_HOLD`, `PAUSED` or `EXPIRED` — the customer's payment didn't come through, or they stopped" },
                  { from: "expired", to: "active", when: "`RECOVERED` / `RESTARTED` — paid again, new dates" },
                  { from: "active", to: "cancelled", when: "Refunded or revoked (`voidedPurchaseNotification`, `SUBSCRIPTION_REVOKED`) — or cancelled in the dashboard, which also cancels the subscription in Google Play so it doesn't renew" },
                ]}
              />
              <Callout>
                <p>
                  <Rich text="`SUBSCRIPTION_CANCELED` only turns auto-renew off: the order stays active until its end date, then expires." />
                </p>
              </Callout>
            </>
          ),
        },
        {
          id: "setup",
          title: "Setup",
          body: (
            <>
              {play.setup.map((s) => (
                <div key={s.title} className="grid gap-2">
                  <Sub>{s.title}</Sub>
                  <Steps steps={s.steps} />
                </div>
              ))}
              <Sub>Server settings (`.env.local`, then restart)</Sub>
              <DocTable head={["Setting", "What it is"]} rows={play.env.map((e) => [`\`${e.name}\``, e.description])} />
              <CodeBlock code={play.env.map((e) => `${e.name}=${e.example}`).join("\n")} />
            </>
          ),
        },
        {
          id: "android",
          title: "In the Android app",
          body: (
            <>
              <Sub>Simplest — name only the user</Sub>
              <CodeBlock code={KOTLIN_SIMPLE} />
              <Sub>Order first — name the order too</Sub>
              <CodeBlock code={KOTLIN_ORDER_FIRST} />
              <Sub>Then check access</Sub>
              <CodeBlock code={VERIFY} />
              <Bullets
                items={[
                  "`user.id` is the `user.id` the App API returned from `/api/webhooks/user` (sign the user in first).",
                  "Don't acknowledge purchases in the app — the server does it after checking with Google (Google refunds purchases not acknowledged within 3 days).",
                  "The order can take a few seconds to appear (Google's notification): call `/verify` again shortly if it isn't there yet.",
                ]}
              />
            </>
          ),
        },
        {
          id: "events",
          title: "Webhook events",
          description: "Google only says what changed; the server reads the purchase again, so repeats or late notifications are harmless.",
          body: <DocTable head={["Notification", "What happens"]} rows={play.events.map((e) => [e.name, e.effect])} />,
        },
        {
          id: "testing",
          title: "Testing",
          body: (
            <>
              {play.test
                .filter((s) => !s.commands)
                .map((s) => (
                  <div key={s.title} className="grid gap-2">
                    <Sub>{s.title}</Sub>
                    <Steps steps={s.steps} />
                  </div>
                ))}
            </>
          ),
        },
        {
          id: "troubleshooting",
          title: "Troubleshooting",
          body: (
            <DocTable
              head={["What you see", "Why / what to do"]}
              rows={[
                ["No order after a purchase", "Check the push subscription's deliveries (Pub/Sub → Metrics). Then: did the app pass `setObfuscatedAccountId(user.id)` with the App API's user id? Is the app added on the Apps page with this package name?"],
                ["Deliveries fail with 401 `GOOGLE_PUSH_UNAUTHORIZED`", "The push subscription's Audience or service account doesn't match `GOOGLE_PLAY_PUSH_AUDIENCE` / `GOOGLE_PLAY_PUSH_EMAIL`"],
                ["Deliveries fail with 503 `GOOGLE_PLAY_NOT_CONFIGURED`", "The Google settings are missing — add them to `.env.local` and restart"],
                ["Deliveries fail with 502 `GOOGLE_PLAY_ERROR`", "The service account can't read the purchase or the product — give it View app information, View financial data, Manage orders and subscriptions in Play Console"],
                ["Answered `ignored`", "Another app's package, no user named, a user of another app, or (order first) the wrong product / order already paid. Pub/Sub doesn't retry these"],
                ["Purchase refunded after 3 days", "It wasn't acknowledged — the webhook wasn't reached in time; fix the delivery and it acknowledges on the next notification"],
                ["Prices differ from the order template", "Google charges the Play Console price; keep the template's price the same, or use the simplest way (no template)"],
              ]}
            />
          ),
        },
      ]}
    />
  );
}
