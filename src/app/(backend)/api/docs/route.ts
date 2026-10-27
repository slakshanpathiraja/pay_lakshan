import { json } from "@/server/http";
import { apiDocsEnabled } from "@/server/openapi";

const SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.1";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pay Portal API</title>
  <meta name="color-scheme" content="light" />
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  <!-- Swagger UI's dark mode is partial and unreadable; keep it light. -->
  <style>body { margin: 0; background: #fff; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/docs/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: true,
      // Send the session cookie with "Try it out" requests.
      requestInterceptor: (req) => { req.credentials = "same-origin"; return req; },
    });
  </script>
</body>
</html>`;

/** Swagger UI for the backend API. */
export function GET() {
  if (!apiDocsEnabled()) return json({ error: "NOT_FOUND" }, 404);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
