import { isRejectedWithValue, type Middleware } from "@reduxjs/toolkit";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import type { TranslationKey } from "@/i18n/config";
import { translate } from "@/i18n/translate";
import type { RootState } from "./store";
import type { ApiErrorBody } from "./types";

// Errors handled elsewhere: 401 / password change redirect (see baseQuery in api.ts).
const SILENT_CODES = new Set(["UNAUTHENTICATED", "PASSWORD_CHANGE_REQUIRED"]);
// Endpoints that present their own error result (the SMTP test shows the server's reply).
const SILENT_ENDPOINTS = new Set(["testSmtpServer"]);

/**
 * The one place API errors are shown: every failed request becomes an alert with the
 * server's `message` (already in the user's language). Unknown failures fall back to a
 * translated generic message. The same error repeated quickly shows once.
 */
export const apiErrorMiddleware: Middleware<object, RootState> =
  (store) => (next) => (action) => {
    if (isRejectedWithValue(action)) {
      const endpoint = (action.meta as { arg?: { endpointName?: string } }).arg
        ?.endpointName;
      const error = action.payload as FetchBaseQueryError;
      const body = error.data as ApiErrorBody | undefined;
      const code =
        error.status === "FETCH_ERROR"
          ? "NETWORK"
          : (body?.error ?? "INTERNAL_ERROR");

      if (!SILENT_CODES.has(code) && !SILENT_ENDPOINTS.has(endpoint ?? "")) {
        const locale = store.getState().ui.locale;
        const message =
          body?.message ??
          translate(locale, `errors.${code}` as TranslationKey);
        // e.g. the URLs that were rejected on a permission card
        const details =
          Array.isArray(body?.details) &&
          body.details.every((d) => typeof d === "string")
            ? (body.details as string[]).join(", ")
            : undefined;
        toast.error(message, { id: `api-error-${code}`, description: details });
      }
    }
    return next(action);
  };
