"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Active/inactive toggle for a row. `onChange` calls the status API; `disabledReason`
 * explains why it can't be changed (missing permission, own account, …).
 */
export function StatusSwitch({
  active,
  onChange,
  disabledReason,
  className,
}: {
  active: boolean;
  /** calls the status API; its response `message` (from the backend) is shown */
  onChange: (next: boolean) => Promise<{ message?: string }>;
  disabledReason?: string | null;
  className?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      const res = await onChange(next);
      toast.success(
        res.message ?? t(next ? "status.activated" : "status.deactivated"),
      );
    } catch {
      // the API error middleware shows the error
    } finally {
      setBusy(false);
    }
  };

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-xs",
        disabledReason && "cursor-not-allowed",
        className,
      )}
      title={disabledReason ?? undefined}
    >
      <Switch
        checked={active}
        onCheckedChange={toggle}
        disabled={busy || !!disabledReason}
      />
      <span
        className={
          active
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground"
        }
      >
        {t(active ? "status.active" : "status.inactive")}
      </span>
    </label>
  );
}
