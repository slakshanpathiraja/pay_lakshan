import "server-only";
import { z, type ZodObject, type ZodType } from "zod";
import { endpoints, endpointIds, type EndpointDef } from "./api/endpoints";

// OpenAPI document generated from the API catalog (src/server/api/endpoints.ts), so the
// docs always match what the routes actually validate and enforce.

function jsonSchema(schema: ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: "input",
  });
  return rest;
}

/** One OpenAPI parameter per property of a params/query object schema. */
function parameters(schema: ZodObject | undefined, location: "path" | "query") {
  if (!schema) return [];
  const { properties = {}, required = [] } = jsonSchema(schema) as {
    properties?: Record<string, object>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, propSchema]) => ({
    name,
    in: location,
    required: location === "path" || required.includes(name),
    schema: propSchema,
  }));
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ref("Error") } },
});

const accessNote: Record<EndpointDef["access"], string> = {
  public: "**Access:** public.",
  pending:
    "**Access:** any signed-in user, including one with a temporary password.",
  authenticated: "**Access:** any signed-in user.",
  permission:
    "**Access:** super admin, or a role whose permission cards grant this endpoint.",
};

function operation(id: (typeof endpointIds)[number]) {
  const def: EndpointDef = endpoints[id];
  const status =
    def.method === "DELETE" ? "204" : id.endsWith(".create") ? "201" : "200";
  const responses: Record<string, object> = {
    [status]: { description: "Success" },
  };
  if (def.body || def.params || def.query)
    responses["400"] = errorResponse(
      "VALIDATION_ERROR or a business rule error",
    );
  if (def.access !== "public")
    responses["401"] = errorResponse("Not signed in / session revoked");
  if (def.access === "permission")
    responses["403"] = errorResponse(
      "FORBIDDEN (missing permission) or PASSWORD_CHANGE_REQUIRED",
    );
  if (def.params) responses["404"] = errorResponse("Not found");

  return {
    operationId: id,
    tags: [def.tag],
    summary: def.summary,
    description: [
      def.description,
      accessNote[def.access],
      `**Endpoint id:** \`${id}\``,
    ]
      .filter(Boolean)
      .join("\n\n"),
    security: def.access === "public" ? [] : [{ cookieAuth: [] }],
    parameters: [
      ...parameters(def.params, "path"),
      ...parameters(def.query, "query"),
    ],
    ...(def.body && {
      requestBody: {
        required: true,
        content: { "application/json": { schema: jsonSchema(def.body) } },
      },
    }),
    responses,
  };
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, object>> = {};
  for (const id of endpointIds) {
    const def: EndpointDef = endpoints[id];
    (paths[def.path] ??= {})[def.method.toLowerCase()] = operation(id);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Pay Portal API",
      version: "1.0.0",
      description:
        "Generated from the API catalog. The session is an httpOnly cookie set by `POST /api/auth/login` — " +
        "call it first with **Try it out** and the browser sends the cookie with the other requests.\n\n" +
        "Endpoints marked *permission* can be granted to roles on the Permissions page using their endpoint id.",
    },
    tags: [
      { name: "Auth", description: "Sign in, sign out, your own account" },
      { name: "Managers", description: "Manager accounts" },
      {
        name: "Roles",
        description: "Roles and the permission cards they include",
      },
      {
        name: "Permissions",
        description: "Permission cards (pages + endpoints)",
      },
      {
        name: "Platforms",
        description: "Platforms (tenants); roles and memberships belong to one",
      },
      {
        name: "Apps",
        description: "A platform's websites (domain) and mobile apps (app id)",
      },
      { name: "Users", description: "An app's customers (per platform + app)" },
      { name: "Devices", description: "Customers' devices" },
      {
        name: "Orders",
        description:
          "Orders: one-time (lifetime or for a period) or subscriptions (renewing)",
      },
      { name: "Order templates", description: "An app's ready-made orders (item, price, billing)" },
      {
        name: "Payments",
        description: "Payments Stripe reported for orders (read only)",
      },
      {
        name: "Stripe",
        description:
          "The webhook Stripe calls (one Stripe account, set in the environment)",
      },
      {
        name: "Google Play",
        description: "The Google Play webhook: real-time developer notifications (Pub/Sub push)",
      },
      {
        name: "App API",
        description:
          "Called by a platform's apps with their **app key** and **app secret** (Apps page → View).\n\n" +
          "**Signing** — every parameter value is a string:\n" +
          "1. Add `appKey` and `timestamp` (Unix seconds, within 5 minutes of the server's clock).\n" +
          "2. Sort the parameters by name (leave out `signature`) and join them as `name=value` with `&` — values " +
          "as they are, not URL-encoded.\n" +
          "3. `signature` = HMAC-SHA256 of that text with the app secret, as lowercase hex. Send it with the " +
          "others (JSON body; for GET /verify, query parameters).\n\n" +
          "```\n" +
          "appKey=ak_…&email=user@example.com&password=…&timestamp=1767225600\n" +
          "signature = hex(HMAC_SHA256(appSecret, ↑))\n" +
          "```\n\n" +
          "**Users** — `POST /user` returns `accessToken` (1 hour) and `refreshToken` (30 days). Send " +
          "`Authorization: Bearer <accessToken>` to /device, /order and /verify; get a new one from `POST /refresh` " +
          "(the refresh token is replaced when under 7 days are left).",
      },
      { name: "SMTP", description: "Outgoing mail servers (per platform)" },
      { name: "System" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "pay_session" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" }, details: {} },
          required: ["error"],
        },
      },
    },
    paths,
  };
}

/** Docs are on in development; in production only when API_DOCS=true. */
export function apiDocsEnabled() {
  return (
    process.env.NODE_ENV !== "production" || process.env.API_DOCS === "true"
  );
}
