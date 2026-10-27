// Shared (client + server): an app's config (webhooks and redirects per payment status).

/** Payment statuses an app can redirect the customer to a page for. */
export const REDIRECT_STATUSES = [
  "success",
  "failed",
  "cancelled",
  "pending",
] as const;
export type RedirectStatus = (typeof REDIRECT_STATUSES)[number];

/** Most webhook URLs one app can have. */
export const MAX_WEBHOOKS = 10;

/** http(s) URL check used by the form (the API validates the same). */
export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname
    );
  } catch {
    return false;
  }
}
