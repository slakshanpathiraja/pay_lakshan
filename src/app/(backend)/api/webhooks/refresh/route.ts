import { route } from "@/server/api/route";
import { refreshAccess, verifySignedRequest } from "@/server/app-api";
import { json } from "@/server/http";

/** A new access token; the refresh token itself is replaced only when it is close to its end. */
export const POST = route("appApi.refresh", async ({ body }) => {
  const app = await verifySignedRequest(body);
  return json(await refreshAccess(body.refreshToken, app));
});
