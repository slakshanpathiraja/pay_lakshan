"use client";

import { useMemo } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLocale, useT } from "@/i18n";
import {
  COUNTRIES,
  dialCode,
  flag,
  isCountry,
  nationalNumber,
  toE164,
  type CountryCode,
} from "@/lib/phone";

export interface PhoneValue {
  country: CountryCode;
  number: string;
}

type CountryOption = { code: CountryCode; name: string; dial: string };

const DEFAULT_COUNTRY: CountryCode = "LK";

/** The browser's region (e.g. en-GB → GB), else Sri Lanka. */
export function defaultCountry(): CountryCode {
  if (typeof navigator === "undefined") return DEFAULT_COUNTRY;
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? "";
    return isCountry(region) ? region : DEFAULT_COUNTRY;
  } catch {
    return DEFAULT_COUNTRY;
  }
}

/** Form value for a stored phone (or an empty one in the default country). */
export function phoneValue(
  e164: string | null | undefined,
  country: string | null | undefined,
): PhoneValue {
  return e164 && country && isCountry(country)
    ? { country, number: nationalNumber(e164) }
    : { country: defaultCountry(), number: "" };
}

/** What the API takes: null when empty. */
export function phonePayload(value: PhoneValue) {
  return value.number.trim()
    ? { country: value.country, number: value.number.trim() }
    : null;
}

/** Empty is fine (phone is optional); anything else must be a valid number for the country. */
export const phoneInvalid = (value: PhoneValue) =>
  !!value.number.trim() && !toE164(value.number, value.country);

/** Country (searchable by name, code or dial code) + number. */
export function PhoneInput({
  id,
  value,
  onChange,
  onKeyDown,
}: {
  id?: string;
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const options = useMemo<CountryOption[]>(() => {
    const names = new Intl.DisplayNames([locale, "en"], { type: "region" });
    return COUNTRIES.map((code) => ({
      code,
      name: names.of(code) ?? code,
      dial: dialCode(code),
    })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  const selected = options.find((o) => o.code === value.country) ?? null;
  const invalid = phoneInvalid(value);

  return (
    <div className="grid gap-1.5">
      <div className="flex min-w-0 gap-2">
        <Combobox.Root
          items={options}
          value={selected}
          onValueChange={(o: CountryOption | null) =>
            o && onChange({ ...value, country: o.code })
          }
          itemToStringLabel={(o: CountryOption) => `${o.name} +${o.dial}`}
          isItemEqualToValue={(a: CountryOption, b: CountryOption) =>
            a.code === b.code
          }
          filter={(o: CountryOption, q: string) => {
            const s = q.trim().toLowerCase().replace(/^\+/, "");
            return (
              !s ||
              o.name.toLowerCase().includes(s) ||
              o.code.toLowerCase() === s ||
              o.dial.startsWith(s)
            );
          }}
          autoHighlight
        >
          <Combobox.Trigger
            aria-label={t("appUsers.country")}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 text-sm outline-none dark:bg-input/30"
          >
            <span aria-hidden>{flag(value.country)}</span>
            <span className="tabular-nums">+{dialCode(value.country)}</span>
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </Combobox.Trigger>
          <Combobox.Portal>
            <Combobox.Positioner
              sideOffset={4}
              align="start"
              className="isolate z-50"
            >
              <Combobox.Popup className="w-72 max-w-(--available-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
                <Combobox.Input
                  placeholder={t("appUsers.searchCountry")}
                  className="mb-1 h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground dark:bg-input/30"
                />
                <Combobox.Empty>
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    {t("appUsers.noCountry")}
                  </div>
                </Combobox.Empty>
                <Combobox.List className="max-h-64 overflow-y-auto overscroll-contain outline-0">
                  {(o: CountryOption) => (
                    <Combobox.Item
                      key={o.code}
                      value={o}
                      className="flex cursor-default items-center gap-2 rounded-md px-1.5 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <span aria-hidden>{flag(o.code)}</span>
                      <span className="min-w-0 flex-1 truncate">{o.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        +{o.dial}
                      </span>
                      <Combobox.ItemIndicator>
                        <CheckIcon className="size-4" />
                      </Combobox.ItemIndicator>
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={30}
          aria-invalid={invalid}
          value={value.number}
          onChange={(e) => onChange({ ...value, number: e.target.value })}
          onKeyDown={onKeyDown}
        />
      </div>
      {invalid && (
        <p className="text-xs text-destructive">
          {t("appUsers.phoneInvalid", {
            country: selected?.name ?? value.country,
          })}
        </p>
      )}
    </div>
  );
}
