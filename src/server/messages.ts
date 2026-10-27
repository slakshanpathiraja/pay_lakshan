import "server-only";
import {
  defaultLocale,
  isLocale,
  type Locale,
  type Messages,
  type TranslationKey,
} from "@/i18n/config";
import en from "@/i18n/messages/en";
import si from "@/i18n/messages/si";
import ta from "@/i18n/messages/ta";
import { LOCALE_COOKIE } from "@/lib/session-constants";
import type { ErrorCode } from "./errors";

// Messages the API sends back (errors and success notices), in the requester's language.

const dictionaries: Record<Locale, Messages> = { en, si, ta };

/** The user's language, from the same cookie the UI uses. */
function requestLocale(req: Request): Locale {
  const match = req.headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return isLocale(value) ? value : defaultLocale;
}

function lookup(messages: Messages, key: string): string | undefined {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    ) as string | undefined;
}

/** A translated message for `key` with `{var}` placeholders filled in. */
export function messageFor(
  req: Request,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  let text =
    lookup(dictionaries[requestLocale(req)], key) ?? lookup(en, key) ?? key;
  for (const [k, v] of Object.entries(vars ?? {}))
    text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Human-readable message for an error code. */
export function errorMessage(code: ErrorCode, req: Request): string {
  return messageFor(req, `errors.${code}` as TranslationKey);
}
