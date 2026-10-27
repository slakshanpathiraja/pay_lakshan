"use client";

import { useT } from "@/i18n";
import type { Action } from "@/lib/access";
import { cn } from "@/lib/utils";

export const actionStyles: Record<Action, string> = {
  view: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  create: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  edit: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  delete: "bg-red-500/15 text-red-700 dark:text-red-400",
};

/** Small coloured chips for actions (view / create / edit / delete). */
export function ActionBadges({
  actions,
  className,
}: {
  actions: Action[];
  className?: string;
}) {
  const t = useT();
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {actions.map((a) => (
        <span
          key={a}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
            actionStyles[a],
          )}
        >
          {t(`actions.${a}`)}
        </span>
      ))}
    </span>
  );
}
