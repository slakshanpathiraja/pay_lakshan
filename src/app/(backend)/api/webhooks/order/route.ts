import { route } from "@/server/api/route";
import { requireApiUser, verifySignedRequest } from "@/server/app-api";
import { toMinor } from "@/lib/commerce";
import { ApiError, json } from "@/server/http";
import { createOrder, fromTemplate } from "@/server/orders";

/**
 * An order for the signed-in user: from one of the app's templates (`template`: its code —
 * the price comes from the server) or custom (one item). With `createCheckout` "true"
 * (default) it gets a Stripe payment link; "false" leaves it for Google Play (the billing flow
 * names the order, and the Google Play webhook pays it).
 */
export const POST = route("appApi.order", async ({ req, body }) => {
  const app = await verifySignedRequest(body);
  const user = await requireApiUser(req, app);
  let details;
  if (body.template) {
    details = await fromTemplate(app.id, { code: body.template });
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
      payUrlError: checkoutError,
    },
    201,
  );
});
