import "server-only";
import { ORDER_STATE } from "./commerce";
import { getAppOrigin } from "./config";
import { query } from "./db/pool";
import { stripeClient } from "./stripe";

export type ReturnStatus = "success" | "pending" | "failed" | "cancelled";

/** For a status without its own redirect, the app's redirect that fits best. */
const FALLBACK: Record<ReturnStatus, ReturnStatus[]> = {
  success: ["success"],
  pending: ["pending", "success"],
  failed: ["failed", "cancelled"],
  cancelled: ["cancelled", "failed"],
};

/**
 * Where a customer coming back from the Stripe payment page goes: the order's real status
 * (Stripe is asked directly when our webhook hasn't arrived yet) and the app's redirect for it
 * (App config), with `order` and `status` added. `url` is null when the app has none.
 */
export async function checkoutReturn(orderNumber: string, result: "success" | "cancelled", sessionId?: string) {
  const { rows } = await query<{ app_id: number; platform_id: string; payment_status: string; status: string }>(
    `SELECT o.app_id, o.platform_id, o.payment_status, ${ORDER_STATE} AS status FROM orders o WHERE o.order_number = $1`,
    [orderNumber],
  );
  const order = rows[0];
  if (!order) return { status: result as ReturnStatus, url: null };

  let status: ReturnStatus;
  if (order.payment_status === "paid") status = "success";
  else if (order.status === "cancelled") status = "cancelled";
  else if (result === "cancelled") status = "cancelled";
  else status = (await stripeSaysPaid(order.platform_id, orderNumber, sessionId)) ? "success" : order.payment_status === "failed" ? "failed" : "pending";

  const { rows: redirects } = await query<{ status: ReturnStatus; url: string }>(
    "SELECT status, url FROM app_redirects WHERE app_id = $1",
    [order.app_id],
  );
  const target = FALLBACK[status].map((s) => redirects.find((r) => r.status === s)?.url).find(Boolean);
  if (!target) return { status, url: null };

  const origin = getAppOrigin();
  const url = new URL(/^https?:\/\//i.test(target) ? target : `${origin}${target.startsWith("/") ? "" : "/"}${target}`);
  url.searchParams.set("order", orderNumber);
  url.searchParams.set("status", status);
  return { status, url: url.toString() };
}

/** Stripe's own answer for this order's Checkout session, before our webhook has recorded it. */
async function stripeSaysPaid(platformId: string, orderNumber: string, sessionId?: string) {
  const stripe = await stripeClient(platformId);
  if (!stripe || !sessionId?.startsWith("cs_")) return false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return (
      session.metadata?.order_number === orderNumber &&
      (session.payment_status === "paid" || session.payment_status === "no_payment_required")
    );
  } catch {
    return false;
  }
}
