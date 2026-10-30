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

/** "5 minutes ago", "2 days ago" — how long ago `value` was. */
export function formatAgo(value: string, locale: Locale, now = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale[locale], { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, "second");
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
