"use client";

import { Bullets, Callout, CodeBlock, DocTable, FlowDiagram, Guide, Rich, Steps, Sub } from "@/components/app/guide";

const PAYLOAD = `POST https://your-app.example.com/pay-webhook
Content-Type: application/json
X-Pay-Event: order.updated
X-Pay-Delivery: evt_1042
X-Pay-Timestamp: 1767225600
X-Pay-Signature: 3f1c…64 hex characters

{
  "id": "evt_1042",
  "type": "order.updated",
  "createdAt": "2026-10-27T10:55:33.837Z",
  "data": {
    "order": {
      "orderId": "ORD-261027-K7EGQ7",
      "status": "active",
      "paymentStatus": "paid",
      "billing": "recurring",
      "currency": "USD",
      "amount": "4.99",
      "template": "ninja",
      "startsAt": "2026-10-27T10:55:33.000Z",
      "expiresAt": "2026-11-27T10:55:33.000Z",
      "user": { "id": 42, "email": "customer@example.com" }
    },
    "previous": { "status": "pending", "paymentStatus": "pending" }
  }
}`;

const NODE = `// Express — the raw body is needed: the signature is over the exact bytes received
import crypto from "node:crypto";
import express from "express";

const app = express();

app.post("/pay-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const timestamp = req.get("X-Pay-Timestamp") ?? "";
  const signature = req.get("X-Pay-Signature") ?? "";
  const expected = crypto
    .createHmac("sha256", process.env.PAY_APP_SECRET)
    .update(\`\${timestamp}.\${req.body}\`)
    .digest("hex");
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return res.sendStatus(401);

  const event = JSON.parse(req.body);
  // event.type: order.created | order.updated | order.renewed — event.data.order is the order now
  res.sendStatus(200);
});`;

const NEXT = `// Next.js — app/api/pay-webhook/route.ts
import crypto from "node:crypto";

export async function POST(req: Request) {
  const body = await req.text(); // raw body, before any JSON parsing
  const timestamp = req.headers.get("x-pay-timestamp") ?? "";
  const signature = req.headers.get("x-pay-signature") ?? "";
  const expected = crypto
    .createHmac("sha256", process.env.PAY_APP_SECRET!)
    .update(\`\${timestamp}.\${body}\`)
    .digest("hex");
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return new Response("bad signature", { status: 401 });
  }

  const event = JSON.parse(body);
  // …update your records from event.data.order
  return new Response("ok");
}`;

const PYTHON = `# Flask
import hashlib, hmac, json, os, time
from flask import Flask, abort, request

app = Flask(__name__)

@app.post("/pay-webhook")
def pay_webhook():
    timestamp = request.headers.get("X-Pay-Timestamp", "")
    signature = request.headers.get("X-Pay-Signature", "")
    body = request.get_data()  # raw bytes
    expected = hmac.new(
        os.environ["PAY_APP_SECRET"].encode(),
        timestamp.encode() + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected) or abs(time.time() - int(timestamp or 0)) > 300:
        abort(401)

    event = json.loads(body)
    # event["type"], event["data"]["order"]
    return "", 200`;

const PHP = `<?php
// pay-webhook.php
$secret = getenv('PAY_APP_SECRET');
$body = file_get_contents('php://input');            // raw body
$timestamp = $_SERVER['HTTP_X_PAY_TIMESTAMP'] ?? '';
$signature = $_SERVER['HTTP_X_PAY_SIGNATURE'] ?? '';

$expected = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
if (!hash_equals($expected, $signature) || abs(time() - (int) $timestamp) > 300) {
    http_response_code(401);
    exit;
}

$event = json_decode($body, true);
// $event['type'], $event['data']['order']
http_response_code(200);`;

/** Docs → App webhooks: what this server sends to an app's webhook URLs, and the return page. */
export default function AppWebhooksGuidePage() {
  return (
    <Guide
      title="App webhooks guide"
      summary="Your app's own webhooks: every time one of its orders changes — created, paid, renewed, failed, expired, cancelled, refunded — this server POSTs it to the app's webhook URLs, signed with the app secret. Plus where customers land after the Stripe payment page."
      sections={[
        {
          id: "overview",
          title: "Overview",
          body: (
            <>
              <Bullets
                items={[
                  "Set one or more **webhook URLs** per app: Apps page → the app → **Config** → Webhooks.",
                  "Any change to an order of that app is sent there — whatever made it: Stripe, Google Play, a manager in the dashboard, or the expiry cron.",
                  "Each request is **signed** with the app's secret (the same `appSecret` the App API uses), so your server can check it came from here.",
                  "A delivery that doesn't get a 2xx answer is **retried** for several hours.",
                ]}
              />
              <FlowDiagram
                steps={[
                  { actor: "stripe", title: "Something changes the order", detail: "Stripe or Google Play webhook, a manager, the expiry cron" },
                  { actor: "server", title: "The change is queued for each webhook URL", detail: "in the same database transaction — none are lost" },
                  { actor: "server", title: "This server POSTs the event", detail: "right after the request, and on every `/api/health` run" },
                  { actor: "app", title: "Your server checks the signature and answers 2xx", detail: "then updates its records from `data.order`" },
                ]}
                footer="No 2xx within 10 seconds → tried again 2, 4, 8 … minutes later."
              />
            </>
          ),
        },
        {
          id: "events",
          title: "Events",
          body: (
            <>
              <DocTable
                head={["Event (`type`, `X-Pay-Event`)", "Sent when"]}
                rows={[
                  ["`order.created`", "An order of the app is created — dashboard, App API `/order`, or a Google Play purchase."],
                  ["`order.updated`", "Its payment status or order status changes: paid, failed, refunded, active, expired, cancelled. `data.previous` has the statuses before."],
                  ["`order.renewed`", "A subscription renewed: still active and paid, and its end (`expiresAt`) moved forward."],
                ]}
              />
              <Callout>
                <p>
                  <Rich text="Several changes to one order at once (e.g. paid **and** active) make **one** `order.updated`. Treat `data.order` as the truth — it is the order as it is **when the event is sent**, not when it was queued." />
                </p>
              </Callout>
            </>
          ),
        },
        {
          id: "payload",
          title: "The request",
          body: (
            <>
              <CodeBlock code={PAYLOAD} />
              <Sub>Headers</Sub>
              <DocTable
                head={["Header", "What it is"]}
                rows={[
                  ["`X-Pay-Event`", "The event type, same as `type` in the body."],
                  ["`X-Pay-Delivery`", "The event id, same as `id`. A retry keeps it — use it to ignore an event you already handled."],
                  ["`X-Pay-Timestamp`", "Unix seconds when this attempt was sent. Reject requests older than about 5 minutes."],
                  ["`X-Pay-Signature`", "Hex HMAC-SHA256 of `timestamp + \".\" + raw body`, with the app secret as the key."],
                ]}
              />
              <Sub>`data.order`</Sub>
              <DocTable
                head={["Field", "What it is"]}
                rows={[
                  ["`orderId`", "The order number, e.g. `ORD-261027-K7EGQ7` (the same as in the App API)."],
                  ["`status`", "`pending`, `active`, `expired` or `cancelled`. Access = `active`."],
                  ["`paymentStatus`", "`pending`, `paid`, `failed` or `refunded`."],
                  ["`billing`", "`lifetime`, `fixed_term` or `recurring`."],
                  ["`currency`, `amount`", "The order total as text in the currency's units, e.g. `\"4.99\"`."],
                  ["`template`", "The order template's code, or `null` for a custom order."],
                  ["`startsAt`, `expiresAt`", "The access period (ISO times). `expiresAt` is `null` for lifetime."],
                  ["`user`", "`id` and `email` of the app's user who owns the order."],
                ]}
              />
            </>
          ),
        },
        {
          id: "signature",
          title: "Checking the signature",
          description: "Always check it before trusting the request — anyone can POST to your URL.",
          body: (
            <>
              <Steps
                steps={[
                  "Read the **raw** request body (before parsing JSON — re-encoding it changes the bytes).",
                  "Compute HMAC-SHA256 of `X-Pay-Timestamp + \".\" + body` with your app secret, as lowercase hex.",
                  "Compare it to `X-Pay-Signature` with a constant-time compare; answer 401 if it differs.",
                  "Reject it when `X-Pay-Timestamp` is more than 5 minutes off, so an old request can't be replayed.",
                ]}
              />
              <Sub>Node.js (Express)</Sub>
              <CodeBlock code={NODE} />
              <Sub>Next.js (route handler)</Sub>
              <CodeBlock code={NEXT} />
              <Sub>Python (Flask)</Sub>
              <CodeBlock code={PYTHON} />
              <Sub>PHP</Sub>
              <CodeBlock code={PHP} />
              <Callout tone="warn">
                <p>
                  <Rich text="Keep the app secret on your server only. It is the key that proves a request is real — and the one that signs App API requests." />
                </p>
              </Callout>
            </>
          ),
        },
        {
          id: "retries",
          title: "Answering and retries",
          body: (
            <>
              <Bullets
                items={[
                  "Answer with any **2xx** within **10 seconds** — do slow work after answering.",
                  "Anything else (3xx, 4xx, 5xx, a timeout, no connection) is retried: 2, 4, 8, 16, 32, 64 and 128 minutes later — **8 tries** in all, then it is given up.",
                  "Redirects aren't followed: give the final URL.",
                  "A retry can arrive after a newer event — read `data.order` rather than replaying events in order.",
                  "The same event can arrive twice (e.g. your 2xx was lost): skip an `id` you already handled.",
                ]}
              />
            </>
          ),
        },
        {
          id: "return-page",
          title: "After the payment page (redirects)",
          description: "Where Stripe sends the customer back, and how they reach your app.",
          body: (
            <>
              <Steps
                steps={[
                  "Stripe always returns the customer to this server: `/checkout/success` or `/checkout/cancelled`, with `order=` (and `session_id=` after paying).",
                  "This page reads the order's **real** status — if our Stripe webhook hasn't arrived yet, it asks Stripe about that session.",
                  "It shows a spinner for about a second, then sends them to the app's redirect for that status (App config → Redirects), with `?order=ORD-…&status=…` added.",
                  "Without a redirect for it, the result is shown on this page instead.",
                ]}
              />
              <DocTable
                head={["`status`", "When", "Redirect used (first one set)"]}
                rows={[
                  ["`success`", "The order is paid (or Stripe says the session is paid).", "success"],
                  ["`pending`", "Back from paying, but the payment hasn't gone through yet (e.g. a bank debit).", "pending → success"],
                  ["`failed`", "The payment failed.", "failed → cancelled"],
                  ["`cancelled`", "The customer left the payment page, or the order is cancelled.", "cancelled → failed"],
                ]}
              />
              <CodeBlock code="https://your-app.example.com/thanks?order=ORD-261027-K7EGQ7&status=success" />
              <Callout tone="warn">
                <p>
                  <Rich text="`status` in the URL is for showing the right message only — anyone can type it. Give access from a signed webhook or the App API's `/verify`." />
                </p>
              </Callout>
            </>
          ),
        },
        {
          id: "setup",
          title: "Setup",
          body: (
            <Steps
              steps={[
                "Apps page → the app → **View**: copy its `appSecret` to your server (e.g. `PAY_APP_SECRET`).",
                "Apps page → the app → **Config** → Webhooks: add your endpoint, e.g. `https://your-app.example.com/pay-webhook`. It must be reachable from the internet.",
                "Same dialog → Redirects: the page for each payment status (success, pending, failed, cancelled).",
                "Make sure a cron job calls `GET /api/health` every few minutes — it sends retries and anything still queued.",
              ]}
            />
          ),
        },
        {
          id: "testing",
          title: "Testing",
          body: (
            <Steps
              steps={[
                "Point a webhook at a request inspector (e.g. webhook.site) or your local server through a tunnel.",
                "Create an order for the app (dashboard or App API) → `order.created` arrives.",
                "Change its payment status to Paid in the dashboard → `order.updated` with `previous`.",
                "Answer 500 once to see the retry a couple of minutes later (or call `/api/health` after the wait).",
              ]}
            />
          ),
        },
        {
          id: "troubleshooting",
          title: "Troubleshooting",
          body: (
            <DocTable
              head={["What you see", "Why / what to do"]}
              rows={[
                ["Nothing arrives", "Is the URL in this app's Config (not another app's)? Is it public — no login page, firewall or Cloudflare Access in front of it? Is the health cron running?"],
                ["Your signature check fails", "Use the raw body, not re-encoded JSON; the key is the app secret (not the app key); the text is `timestamp.body` with a dot."],
                ["Old events arrive late", "They were being retried while your endpoint was down — `data.order` is still the current order."],
                ["Customer lands on this server's page", "The app has no redirect for that status (or the one it falls back to) — add it in Config → Redirects."],
              ]}
            />
          ),
        },
      ]}
    />
  );
}
