"use client";

import { useState } from "react";
import { Check, CircleCheck, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT, type TFunction } from "@/i18n";

export function inviteMessage(
  t: TFunction,
  username: string,
  password: string,
) {
  return t("managers.inviteMessage", {
    url: `${window.location.origin}/login`,
    username,
    password,
  });
}

/** Copyable invite with sign-in link, username and temporary password (shown once). */
export function InviteView({
  title,
  description,
  message,
  onDone,
}: {
  title: string;
  /** defaults to the "send this invite" text */
  description?: string;
  message: string;
  onDone: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success(t("managers.inviteCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("managers.copyFailed"));
    }
  };

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CircleCheck className="size-5 text-emerald-500" />
          {title}
        </DialogTitle>
        <DialogDescription>
          {description ?? t("managers.inviteDescription")}
        </DialogDescription>
      </DialogHeader>
      <pre className="rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
        {message}
      </pre>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("managers.done")}
        </Button>
        <Button type="button" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? t("managers.copied") : t("managers.copyInvite")}
        </Button>
      </DialogFooter>
    </div>
  );
}
