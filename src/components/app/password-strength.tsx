"use client";

import { Check, X } from "lucide-react";
import { useT } from "@/i18n";
import { passwordStrength } from "@/lib/password-rules";
import { cn } from "@/lib/utils";

/** Colour along the scale: 0% red → 50% orange → 100% green. */
function hueFor(percent: number) {
  return Math.round((percent / 100) * 140);
}

/** Live security level: a red → orange → green progress line with the percentage at its end. */
export function PasswordStrength({ password }: { password: string }) {
  const t = useT();
  const { results, percent } = passwordStrength(password);
  const color = `hsl(${hueFor(percent)} 85% 45%)`;

  return (
    // -mt-1 tucks the bar right under the password box
    <div className="-mt-1 grid gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div
          className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={t("password.strength")}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {/* The gradient spans the full track width, so the filled part reveals
              red first, then orange, and only reaches green at 100%. */}
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${percent}%`,
              backgroundImage:
                "linear-gradient(90deg, #ef4444, #f97316 50%, #22c55e)",
              backgroundSize: percent
                ? `${(100 / percent) * 100}% 100%`
                : undefined,
            }}
          />
        </div>
        <span
          className="w-10 text-right text-sm font-semibold tabular-nums transition-colors"
          style={{ color: password ? color : undefined }}
        >
          {percent}%
        </span>
      </div>

      <ul className="grid gap-1 sm:grid-cols-2">
        {results.map(({ rule, passed }) => (
          <li
            key={rule.key}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              passed
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
            )}
          >
            {passed ? (
              <Check className="size-3.5" />
            ) : (
              <X className="size-3.5" />
            )}
            {t(rule.label)}
          </li>
        ))}
      </ul>
    </div>
  );
}
