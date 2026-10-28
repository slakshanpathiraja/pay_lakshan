import { route } from "@/server/api/route";
import { getAppOrigin } from "@/server/config";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { createCheckout } from "@/server/stripe";

/** A new Stripe payment link for the order (the open one, if any, stops working). */
export const POST = route("orders.checkout", async ({ req, scope, params }) => {
  const { rowCount } = await query("SELECT 1 FROM orders WHERE id = $1 AND platform_id = $2", [
    params.id,
    scope.platformId,
  ]);
  if (!rowCount) throw new ApiError(404, "NOT_FOUND");
  const link = await createCheckout(params.id, getAppOrigin(req));
  if (!link) throw new ApiError(409, "STRIPE_NOT_CONFIGURED");
  return json({ ...link, message: messageFor(req, "notices.payLinkCreated") });
});
