// Shared (client + server): phone numbers are stored in E.164 ("+94771234567") with the
// country they were entered for (needed for shared codes like +1).
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export type { CountryCode };

export const COUNTRIES: readonly CountryCode[] = getCountries();

export function isCountry(value: string): value is CountryCode {
  return (COUNTRIES as readonly string[]).includes(value);
}

/** "94" for LK */
export const dialCode = (country: CountryCode) =>
  getCountryCallingCode(country);

/** 🇱🇰 for LK */
export const flag = (country: string) =>
  String.fromCodePoint(
    ...[...country.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)),
  );

/** "077 123 4567" (or "+94771234567") in that country → "+94771234567"; null when invalid. */
export function toE164(number: string, country: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(number, country);
  return parsed?.isValid() ? parsed.number : null;
}

/** "+94 77 123 4567" for display. */
export function formatPhone(e164: string) {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/** The national part of a stored number, for editing ("771234567"). */
export function nationalNumber(e164: string) {
  return parsePhoneNumberFromString(e164)?.nationalNumber ?? "";
}
