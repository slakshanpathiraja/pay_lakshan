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

const stripe = INCOMING_DOCS.stripe;

const ORDER_REQUEST = `// POST /api/webhooks/order  (Authorization: Bearer <accessToken>)
{
  "appKey": "ak_…",
  "timestamp": "1767225600",
  "template": "pro_monthly",
  "signature": "<HMAC-SHA256 of the sorted parameters with the app secret>"
}

// 201
{
  "order": {
    "orderId": "ORD-261027-K7EGQ7",
    "paymentStatus": "pending",
    "status": "pending",
    "payUrl": "https://checkout.stripe.com/c/pay/cs_test_…",
    "payUrlExpiresAt": "2026-10-28T10:00:00.000Z"
  },
  "payUrlError": null
}`;

const VERIFY_RESPONSE = `// GET /api/webhooks/verify?appKey=…&email=…&timestamp=…&signature=…
{
  "email": "customer@example.com",
  "orders": [
    { "orderId": "ORD-261027-K7EGQ7", "status": "active", "expiresAt": "2026-11-27T10:00:00.000Z" }
  ]
}`;

/** Docs → Stripe: how Stripe payments work here, end to end. Open to every signed-in member. */
export default function StripeGuidePage() {
  return (
    <Guide
      title="Stripe payments guide"
      summary="How orders are paid with Stripe — on the web or from any app — from the payment link to the webhook that activates the order. One Stripe account serves every platform; each order knows its platform."
      sections={[
        {
          id: "overview",
          title: "Overview",
          body: (
            <>
              <Bullets
                items={[
                  "Every order can get a **Stripe payment link** (a Stripe Checkout page). The customer pays there with any method you turned on in Stripe — cards, Apple Pay, Google Pay, Link and more.",
                  "Stripe then calls the **Stripe webhook** (`/api/stripe/webhook`). It marks the order paid and active, records the payment (Payments page) and emails the customer.",
                  "Subscriptions renew in Stripe; each renewal, failure or refund comes through the same webhook and updates the order.",
                  "Your app never sees card details. It only creates the order and checks it with `/verify`.",
                ]}
              />
              <DocTable
                head={["Where", "What"]}
                rows={[
                  ["Payment link", "Created with the order (dashboard or App API `/order`), works for 24 hours, can be made again"],
                  ["Webhook", "`POST /api/stripe/webhook` — called by Stripe, checked with `STRIPE_WEBHOOK_SECRET`"],
                  ["Access check", "`GET /api/webhooks/verify` — your app asks whether the user has an active order"],
                  ["Expiry", "`GET /api/health` from a cron job marks orders past their end as expired"],
                ]}
              />
            </>
          ),
        },
        {
          id: "flow",
          title: "How a payment works",
          description: "From your app creating the order to the order being active.",
          body: (
            <FlowDiagram
              steps={[
                { actor: "app", title: "App calls `POST /api/webhooks/order`", detail: "`template` (or a custom item) + signature + Bearer token" },
                { actor: "server", title: "Server creates the order — pending", detail: "price from the template, returns `payUrl` (Stripe Checkout)" },
                { actor: "customer", title: "Customer opens `payUrl` and pays", detail: "Stripe's page, any method you turned on" },
                { actor: "stripe", title: "Stripe calls `/api/stripe/webhook`", detail: "order paid + active, payment recorded, email sent" },
                { actor: "app", title: "App calls `GET /api/webhooks/verify`", detail: "an `active` order whose `expiresAt` is in the future (or null) = access" },
              ]}
              footer="Renewals, failed payments and refunds: Stripe calls step 4 again and the order follows."
            />
          ),
        },
        {
          id: "lifecycle",
          title: "Order status over time",
          description: "An order has a payment status (pending, paid, failed, refunded) and an order status (below).",
          body: (
            <>
              <StateDiagram
                moves={[
                  { from: "pending", to: "active", when: "The payment went through (`checkout.session.completed` / first `invoice.paid`) — the period starts now" },
                  { from: "active", to: "active", when: "Subscription renewed (`invoice.paid`) — the end date moves forward and the customer gets a “subscription renewed” email" },
                  { from: "active", to: "expired", when: "The period ended without a renewal (e.g. the card failed) — the health cron stores it" },
                  { from: "expired", to: "active", when: "The customer paid later (Stripe retried, or paid the invoice link) — new dates" },
                  { from: "active", to: "cancelled", when: "Subscription ended in Stripe, a full refund of a one-time order, or cancelled in the dashboard" },
                  { from: "pending", to: "cancelled", when: "Cancelled before it was paid (the payment link stops working)" },
                ]}
              />
              <Callout>
                <p>
                  <Rich text="A failed renewal sets the payment to `failed` but keeps the order active until its end date — Stripe keeps retrying, and the order gets the invoice's pay link so the customer can fix it." />
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
              <Sub>1. Server settings (`.env.local`, then restart)</Sub>
              <DocTable head={["Setting", "What it is"]} rows={stripe.env.map((e) => [`\`${e.name}\``, e.description])} />
              <CodeBlock code={stripe.env.map((e) => `${e.name}=${e.example}`).join("\n")} />
              <Sub>2. Stripe Dashboard</Sub>
              <Steps
                steps={[
                  "Developers → API keys: copy the secret key (`sk_test_…` in test mode) into `STRIPE_SECRET_KEY`.",
                  "Developers → Webhooks → Add endpoint: `https://<your-domain>/api/stripe/webhook`.",
                  `Select these events: ${stripe.events.map((e) => `\`${e.name}\``).join(", ")}.`,
                  "Copy the endpoint's Signing secret into `STRIPE_WEBHOOK_SECRET`.",
                  "Settings → Payment methods: turn on the methods you want to offer.",
                  "Settings → Branding: logo, colours and font of the payment page.",
                ]}
              />
              <Sub>3. Your apps</Sub>
              <Steps
                steps={[
                  "Apps page → add the app; View shows its `appKey` and `appSecret` for the App API.",
                  "App config → redirects for `success` and `cancelled`: where Stripe sends the customer after paying (otherwise a simple built-in page).",
                  "Order templates → the plans you sell (code, price, billing) so apps order by `template`.",
                ]}
              />
              <Sub>4. Expiry cron</Sub>
              <p className="text-sm">
                <Rich text="Call `GET https://<your-domain>/api/health` every few minutes (any cron service). It stores `expired` on orders past their end and sends queued emails." />
              </p>
              <Callout tone="warn">
                <p>
                  <Rich text="The webhook URL must be reachable from the internet. A Cloudflare tunnel works — but keep Cloudflare Access (login) off `/api/stripe/webhook` and `/api/health`." />
                </p>
              </Callout>
            </>
          ),
        },
        {
          id: "create-orders",
          title: "Creating orders",
          body: (
            <>
              <Sub>From the dashboard</Sub>
              <Steps
                steps={[
                  "Orders → New order: pick the app, the customer and a template (or a custom item).",
                  "Keep “Create a Stripe payment link” on — the link appears right after you create it; copy it to the customer.",
                  "Later: the order's menu → Payment link shows it again, or makes a new one if it expired (the old one stops working).",
                ]}
              />
              <Sub>From your app (App API)</Sub>
              <p className="text-sm">
                <Rich text="Sign the user in with `/api/webhooks/user` (gives the Bearer token), then create the order. Open `payUrl` in a browser or in-app browser." />
              </p>
              <CodeBlock code={ORDER_REQUEST} />
              <p className="text-sm">
                <Rich text="Every request is signed: sort the parameters by name, join them as `name=value` with `&`, HMAC-SHA256 with the app secret (hex). Full examples in Node.js, Python and cURL are on Webhooks → Create order → Code." />
              </p>
              <Sub>Checking access</Sub>
              <CodeBlock code={VERIFY_RESPONSE} />
              <Callout>
                <p>
                  <Rich text="Don't rely on the redirect after payment — the customer might close the page. Always check with `/verify`." />
                </p>
              </Callout>
            </>
          ),
        },
        {
          id: "events",
          title: "Webhook events",
          description: "What each Stripe event does to the order. Every event is checked, handled once, and re-read from Stripe.",
          body: <DocTable head={["Event", "What happens"]} rows={stripe.events.map((e) => [`\`${e.name}\``, e.effect])} />,
        },
        {
          id: "payment-methods",
          title: "Payment methods",
          body: (
            <>
              <p className="text-sm">
                <Rich text="Stripe decides which turned-on methods to show for each payment. A method is hidden when it doesn't fit:" />
              </p>
              <DocTable
                head={["Rule", "Example"]}
                rows={[
                  ["Subscriptions need methods that can charge again", "Cards, Apple Pay, Google Pay, Link, SEPA, ACH — not Klarna, Alipay, WeChat Pay"],
                  ["The currency", "iDEAL needs EUR; ACH and Cash App Pay need USD"],
                  ["The customer's country (from their connection)", "Someone in Sri Lanka paying in LKR sees cards, wallets and Link"],
                  ["Your Stripe account's country and settings", "Some methods must be activated first"],
                ]}
              />
              <p className="text-sm">
                <Rich text="Stripe Dashboard → Settings → Payment methods has a review tool: pick a currency, amount and country to see what shows and why." />
              </p>
            </>
          ),
        },
        {
          id: "testing",
          title: "Testing",
          body: (
            <>
              <Steps
                steps={[
                  "Use the test-mode keys (`sk_test_…`) and a test webhook secret.",
                  "On your computer: install the Stripe CLI, `stripe login`, then forward events (prints a `whsec_…` for `STRIPE_WEBHOOK_SECRET`).",
                  "Create an order, open its payment link and pay with a test card.",
                  "Watch the order turn paid / active and the payment appear on the Payments page.",
                ]}
              />
              <CodeBlock code="stripe listen --forward-to localhost:3000/api/stripe/webhook" />
              <DocTable
                head={["Test card", "Result"]}
                rows={[
                  ["`4242 4242 4242 4242`", "Pays (any future date, any CVC)"],
                  ["`4000 0025 0000 3155`", "Asks for 3-D Secure authentication"],
                  ["`4000 0000 0000 9995`", "Declined (insufficient funds)"],
                  ["`4000 0000 0000 0341`", "Saves, then fails on the next charge — test a failed renewal"],
                ]}
              />
              <p className="text-sm">
                <Rich text="Stripe Dashboard → Developers → Webhooks → your endpoint lists every delivery with the response; Resend replays one." />
              </p>
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
                ["Order stays pending after paying", "The webhook isn't reaching the server: check the endpoint URL, that it's public, and Stripe's delivery log (Developers → Webhooks)"],
                ["Webhook deliveries fail with 400 `STRIPE_SIGNATURE_INVALID`", "`STRIPE_WEBHOOK_SECRET` isn't this endpoint's signing secret (test and live differ; `stripe listen` has its own)"],
                ["Webhook deliveries fail with 503 `STRIPE_NOT_CONFIGURED`", "The Stripe settings are missing — add them to `.env.local` and restart the server"],
                ["Deliveries get 302 / 403", "A login or firewall (e.g. Cloudflare Access) is in front of `/api/stripe/webhook` — allow that path"],
                ["`payUrlError` says Stripe refused", "Usually the key, or an amount below Stripe's minimum for the currency"],
                ["“Payment link” expired", "Links work 24 hours — make a new one from the order's menu (or `POST /api/orders/{id}/checkout`)"],
                ["Order expired though the customer paid", "The renewal failed; when Stripe's retry or the invoice link succeeds, the order is active again"],
              ]}
            />
          ),
        },
      ]}
    />
  );
}
