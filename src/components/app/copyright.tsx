"use client";

import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export function Copyright({ className }: { className?: string }) {
  const t = useT();
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {t("common.copyright", { year: new Date().getFullYear() })}
    </p>
  );
}
