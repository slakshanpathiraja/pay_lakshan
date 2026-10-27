"use client";

import { useState } from "react";
import { Provider } from "react-redux";
import type { Locale } from "@/i18n/config";
import { makeStore } from "./store";

export function StoreProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [store] = useState(() => makeStore({ ui: { locale } }));
  return <Provider store={store}>{children}</Provider>;
}
