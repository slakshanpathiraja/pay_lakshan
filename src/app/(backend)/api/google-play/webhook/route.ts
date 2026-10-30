import { route } from "@/server/api/route";
import { playClientFor, verifyPushRequest } from "@/server/google-play";
import { decodePush, handlePlayNotification } from "@/server/google-play-sync";
import { ApiError, json } from "@/server/http";

/**
 * Google Play webhook: Real-time developer notifications, pushed by Pub/Sub. One URL for both
 * Play accounts: the push token's audience and sender say which (normal, or *_TEST for
 * platforms marked "test"), and the notification only touches that mode's platforms; the
 * package name says which app. A new purchase pays the order the app named in the billing
 * flow; later ones keep it up to date. 2xx tells Pub/Sub it's done; an error makes it try
 * again later.
 */
export const POST = route("googlePlay.webhook", async ({ req }) => {
  const mode = await verifyPushRequest(req);
  const play = playClientFor(mode);
  if (!play) throw new ApiError(503, "GOOGLE_PLAY_NOT_CONFIGURED");
  const notification = decodePush(await req.json().catch(() => null));
  return json({ received: true, result: await handlePlayNotification(play, notification, mode) });
});
