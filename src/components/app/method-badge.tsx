import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/store/types";

const styles: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  POST: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  PATCH: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export function MethodBadge({
  method,
  className,
}: {
  method: HttpMethod;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-14 shrink-0 justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
        styles[method],
        className,
      )}
    >
      {method}
    </span>
  );
}
