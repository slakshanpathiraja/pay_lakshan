"use client";

import { useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  Copy,
  Layers,
  Loader2,
  Pencil,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import { roleName } from "@/lib/role-label";
import {
  errorCode,
  useCurrentPlatformQuery,
  useRenameOwnPlatformMutation,
} from "@/store/api";
import type { Platform } from "@/store/types";

function RenameDialog({
  platform,
  onClose,
}: {
  platform: Platform;
  onClose: () => void;
}) {
  const t = useT();
  const [rename, { isLoading }] = useRenameOwnPlatformMutation();
  const [name, setName] = useState(platform.name);
  const [error, setError] = useState<TranslationKey | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("validation.required");
    try {
      const res = await rename(name.trim()).unwrap();
      toast.success(res.message);
      onClose();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("platforms.editTitle")}</DialogTitle>
            <DialogDescription>
              {t("platforms.editDescription")}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="myPlatformName">{t("platforms.name")}</Label>
            <Input
              id="myPlatformName"
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading || !name.trim() || name.trim() === platform.name
              }
            >
              {isLoading && <Loader2 className="animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** The platform you're working in: its details, your role there, and renaming it. */
export default function MyPlatformPage() {
  const t = useT();
  const { locale } = useLocale();
  const { can } = useAccess();
  const { data, isLoading, error } = useCurrentPlatformQuery();
  const [renaming, setRenaming] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-5xl gap-6">
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert>
        <AlertDescription>
          {t(`errors.${errorCode(error)}` as TranslationKey)}
        </AlertDescription>
      </Alert>
    );
  }

  const { platform, role, platformCount } = data;
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(platform.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("managers.copyFailed"));
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <Card className="overflow-hidden">
        {/* banner */}
        <div className="h-24 bg-gradient-to-r from-primary/25 via-primary/10 to-transparent" />
        <CardHeader className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-primary text-3xl font-semibold text-primary-foreground shadow-sm">
            {platform.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("menu.myPlatform")}
            </p>
            <h2 className="truncate text-2xl font-semibold tracking-tight">
              {platform.name}
            </h2>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyId}
                title={platform.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                <span className="truncate">{platform.id}</span>
                {copied ? (
                  <Check className="size-3 shrink-0" />
                ) : (
                  <Copy className="size-3 shrink-0" />
                )}
              </button>
              {role.name && (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="size-3" />
                  {roleName(t, { key: role.key, name: role.name })}
                </Badge>
              )}
            </CardDescription>
          </div>
          {can("platforms.updateOwn") && (
            <Button variant="outline" onClick={() => setRenaming(true)}>
              <Pencil /> {t("platforms.rename")}
            </Button>
          )}
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Users}
          label={t("platforms.members")}
          value={platform.member_count}
        />
        <Stat
          icon={ShieldCheck}
          label={t("platforms.roles")}
          value={platform.role_count}
        />
        <Stat
          icon={Layers}
          label={t("platforms.yourPlatforms")}
          value={platformCount}
        />
        <Stat
          icon={CalendarDays}
          label={t("platforms.createdAt")}
          value={
            <span className="text-base">
              {formatDateTime(platform.created_at, locale, "—")}
            </span>
          }
        />
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
          <Building2 className="mt-0.5 size-4 shrink-0" />
          <p>{t("platforms.myPlatformNote")}</p>
        </CardContent>
      </Card>

      {renaming && (
        <RenameDialog platform={platform} onClose={() => setRenaming(false)} />
      )}
    </div>
  );
}
