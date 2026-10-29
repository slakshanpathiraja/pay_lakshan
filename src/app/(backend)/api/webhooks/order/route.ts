import { route } from "@/server/api/route";
import { requireApiUser, verifySignedRequest } from "@/server/app-api";
import { toMinor } from "@/lib/commerce";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { createOrder, fromTemplate, newPayLink } from "@/server/orders";

/**
 * An order for the signed-in user: from one of the app's templates (`template`: its code —
 * the price comes from the server) or custom (one item). With `createCheckout` "true"
 * (default) it gets a Stripe payment link; "false" leaves it for Google Play (the billing flow
 * names the order, and the Google Play webhook pays it).
 * The user's unpaid pending order of the same template is reused (`reused: true`) with a
 * new payment link, instead of piling up another order.
 */
export const POST = route("appApi.order", async ({ req, body }) => {
  const app = await verifySignedRequest(body);
  const user = await requireApiUser(req, app);
  let details;
  if (!body.template) {
    // the app secret ships inside apps, so anyone could set their own price: custom orders
    // only when the app allows them (App config)
    const { rows } = await query<{ allow: boolean }>("SELECT allow_custom_orders AS allow FROM apps WHERE id = $1", [app.id]);
    if (!rows[0]?.allow) throw new ApiError(403, "CUSTOM_ORDERS_OFF");
  }
  if (body.template) {
    details = await fromTemplate(app.id, { code: body.template });
    if (body.createCheckout !== "false") {
      const { rows: pending } = await query<{ id: number; order_number: string; payment_status: string }>(
        `SELECT id, order_number, payment_status FROM orders
          WHERE app_user_id = $1 AND app_id = $2 AND template_id = $3
            AND order_status = 'pending' AND payment_status IN ('pending', 'failed')
            AND google_purchase_token IS NULL AND stripe_subscription_id IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [user.id, app.id, details.templateId],
      );
      if (pending[0]) {
        const { checkout, checkoutError } = await newPayLink(pending[0].id, req);
        return json({
          order: {
            orderId: pending[0].order_number,
            paymentStatus: pending[0].payment_status,
            status: "pending",
            payUrl: checkout?.url ?? null,
            payUrlExpiresAt: checkout?.expiresAt ?? null,
          },
          reused: true,
          payUrlError: checkoutError,
        });
      }
    }
  } else {
    // the schema made sure the custom fields are all there
    const currency = body.currency!;
    const unitAmount = toMinor(body.amount!, currency);
    if (unitAmount === null) {
      throw new ApiError(400, "VALIDATION_ERROR", [
        { path: "amount", message: `An amount in ${currency}, e.g. "9.99"` },
      ]);
    }
    details = {
      currency,
      billing: body.billing!,
      intervalUnit: body.intervalUnit ?? null,
      intervalCount: body.intervalCount ? Number(body.intervalCount) : null,
      items: [{ name: body.itemName!, quantity: Number(body.quantity ?? "1"), unitAmount }],
    };
  }
  const { order, checkout, checkoutError } = await createOrder(
    {
      ...details,
      platformId: app.platform_id,
      appId: app.id,
      appUserId: user.id,
      note: body.note || null,
      createCheckout: body.createCheckout !== "false",
    },
    req,
  );
  return json(
    {
      order: {
        orderId: order.order_number,
        paymentStatus: "pending",
        status: "pending",
        payUrl: checkout?.url ?? null,
        payUrlExpiresAt: checkout?.expiresAt ?? null,
      },
      reused: false,
      payUrlError: checkoutError,
    },
    201,
  );
});
