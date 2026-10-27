import type { Locale, Messages, TranslationKey } from "./config";
import en from "./messages/en";
import si from "./messages/si";
import ta from "./messages/ta";

const dictionaries: Record<Locale, Messages> = { en, si, ta };

/** Plain (non-hook) lookup, for code outside React components such as Redux middleware. */
export function translate(locale: Locale, key: TranslationKey): string {
  const find = (messages: Messages) =>
    key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        messages,
      );
  return (find(dictionaries[locale]) ?? find(en) ?? key) as string;
}
