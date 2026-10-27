import { json } from "@/server/http";
import { apiDocsEnabled, buildOpenApiDocument } from "@/server/openapi";

export function GET() {
  if (!apiDocsEnabled()) return json({ error: "NOT_FOUND" }, 404);
  return json(buildOpenApiDocument());
}
