"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";

/** A read-only value with a copy button (app credentials, payment links, webhook URLs). */
export function CopyField({
  label,
  value,
  secret,
  children,
}: {
  label?: string;
  value: string;
  secret?: boolean;
  /** extra buttons next to the copy button */
  children?: React.ReactNode;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(
        label ? t("apps.copied", { name: label }) : t("orders.linkCopied"),
      );
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("managers.copyFailed"));
    }
  };
  return (
    <div className="grid min-w-0 gap-1.5">
      {label && (
        <Label className="flex items-center gap-1.5">
          {secret && <KeyRound className="size-3.5 text-muted-foreground" />}
          {label}
        </Label>
      )}
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs break-all select-all">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          aria-label={t("apps.copy")}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
        {children}
      </div>
    </div>
  );
}
