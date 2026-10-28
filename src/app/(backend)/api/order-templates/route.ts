import { route } from "@/server/api/route";
import { mapDbError, TEMPLATE_COLUMNS, TEMPLATE_RETURNING, TEMPLATE_UNIQUE } from "@/server/commerce";
import { query } from "@/server/db/pool";
import { json } from "@/server/http";
import { messageFor } from "@/server/messages";
import { pageLimit, paged } from "@/server/paging";

// An app's order templates: ready-made orders ("Pro monthly") the order form and the App API
// (by `code`) create orders from.

export const GET = route("orderTemplates.list", async ({ scope, query: q }) => {
  const { rows } = await query(
    `SELECT ${TEMPLATE_COLUMNS}, a.name AS app_name,
            (SELECT count(*) FROM orders o WHERE o.template_id = t.id) AS order_count
       FROM order_templates t JOIN apps a ON a.id = t.app_id
      WHERE t.platform_id = $1
        AND ($2 IS NULL OR t.app_id = $2)
        AND ($3 IS NULL OR t.is_active = $3)
      ORDER BY a.name, t.name
      ${pageLimit(q.page)}`,
    [scope.platformId, scope.appId ?? null, q.active === undefined ? null : q.active === "true"],
  );
  const { items, page, hasMore } = paged(rows, q.page);
  return json({ templates: items, page, hasMore });
});

export const POST = route("orderTemplates.create", async ({ req, scope, body }) => {
  const period = body.billing === "lifetime" ? null : body;
  try {
    const { rows } = await query(
      `INSERT INTO order_templates (platform_id, app_id, code, name, currency, unit_amount, billing,
                                         interval_unit, interval_count, google_product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${TEMPLATE_RETURNING}`,
      [
        scope.platformId,
        body.appId,
        body.code,
        body.name,
        body.currency,
        body.unitAmount,
        body.billing,
        period?.intervalUnit ?? null,
        period?.intervalCount ?? null,
        body.googleProductId,
      ],
    );
    return json({ template: rows[0], message: messageFor(req, "notices.templateCreated", { name: body.name }) }, 201);
  } catch (err) {
    mapDbError(err, { unique: TEMPLATE_UNIQUE });
  }
});
