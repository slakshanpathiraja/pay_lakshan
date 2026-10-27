"use client";

import type { TranslationKey } from "./config";
import { useT } from "./index";

/** Inline translated text, for places where calling the hook is awkward (e.g. shadcn primitives). */
export function T({ k }: { k: TranslationKey }) {
  return <>{useT()(k)}</>;
}
