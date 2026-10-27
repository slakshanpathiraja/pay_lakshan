"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setLocale as setLocaleAction } from "@/store/ui-slice";
import { LOCALE_COOKIE } from "@/lib/session-constants";
import type { Locale, Messages, TranslationKey } from "./config";
import en from "./messages/en";
import si from "./messages/si";
import ta from "./messages/ta";

const dictionaries: Record<Locale, Messages> = { en, si, ta };

function lookup(messages: Messages, key: string): string | undefined {
  return key.split(".").reduce<unknown>((node, part) => {
    return node && typeof node === "object"
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, messages) as string | undefined;
}

export type TFunction = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

/** Returns `t()` for the current locale (stored in Redux, persisted in a cookie). */
export function useT(): TFunction {
  const locale = useAppSelector((s) => s.ui.locale);
  return useCallback(
    (key, vars) => {
      let text = lookup(dictionaries[locale], key) ?? lookup(en, key) ?? key;
      if (vars)
        for (const [k, v] of Object.entries(vars))
          text = text.replaceAll(`{${k}}`, String(v));
      return text;
    },
    [locale],
  );
}

export function useLocale() {
  const dispatch = useAppDispatch();
  const locale = useAppSelector((s) => s.ui.locale);
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      dispatch(setLocaleAction(next));
    },
    [dispatch],
  );
  return { locale, setLocale };
}
