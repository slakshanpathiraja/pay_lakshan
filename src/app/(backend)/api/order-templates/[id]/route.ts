import { route } from "@/server/api/route";
import { mapDbError, TEMPLATE_RETURNING, TEMPLATE_UNIQUE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { ApiError, json } from "@/server/http";
import { messageFor } from "@/server/messages";

/** Orders already made from it keep their details; only new orders use the change. */
export const PUT = route("orderTemplates.update", async ({ req, scope, params, body }) => {
  const period = body.billing === "lifetime" ? null : body;
  try {
    const { rows } = await query(
      `UPDATE order_templates SET code = $1, name = $2, currency = $3, unit_amount = $4, billing = $5,
              interval_unit = $6, interval_count = $7, google_product_id = $8, updated_at = now()
        WHERE id = $9 AND platform_id = $10 RETURNING ${TEMPLATE_RETURNING}`,
      [
        body.code,
        body.name,
        body.currency,
        body.unitAmount,
        body.billing,
        period?.intervalUnit ?? null,
        period?.intervalCount ?? null,
        body.googleProductId,
        params.id,
        scope.platformId,
      ],
    );
    if (!rows[0]) throw new ApiError(404, "NOT_FOUND");
    return json({ template: rows[0], message: messageFor(req, "notices.templateUpdated", { name: body.name }) });
  } catch (err) {
    mapDbError(err, { unique: TEMPLATE_UNIQUE });
  }
});

/** Orders made from it stay as they are (they keep their own copy). */
export const DELETE = route("orderTemplates.delete", async ({ scope, params }) => {
  const { rowCount } = await query("DELETE FROM order_templates WHERE id = $1 AND platform_id = $2", [
    params.id,
    scope.platformId,
  ]);
  if (!rowCount) throw new ApiError(404, "NOT_FOUND");
  return new Response(null, { status: 204 });
});
