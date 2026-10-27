import type { Locale } from "@/i18n/config";

export const intlLocale: Record<Locale, string> = {
  en: "en-GB",
  si: "si-LK",
  ta: "ta-LK",
};

export function formatDateTime(
  value: string | null,
  locale: Locale,
  fallback: string,
) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Up to two initials for an avatar, e.g. "Kasun Perera" → "KP". */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
