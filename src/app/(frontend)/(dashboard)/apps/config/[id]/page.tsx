"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  Clock,
  Globe,
  Loader2,
  Plus,
  Smartphone,
  Trash2,
  Undo2,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/page-header";
import { useAccess } from "@/hooks/use-access";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  isHttpUrl,
  MAX_WEBHOOKS,
  REDIRECT_STATUSES,
  type RedirectStatus,
} from "@/lib/app-config";
import { useAppConfigQuery, useSaveAppConfigMutation } from "@/store/api";
import type { AppConfig } from "@/store/types";

const STATUS_UI: Record<
  RedirectStatus,
  { icon: typeof CircleCheck; color: string; label: TranslationKey }
> = {
  success: {
    icon: CircleCheck,
    color: "text-emerald-500",
    label: "appConfig.statusSuccess",
  },
  failed: {
    icon: CircleX,
    color: "text-destructive",
    label: "appConfig.statusFailed",
  },
  cancelled: {
    icon: Undo2,
    color: "text-muted-foreground",
    label: "appConfig.statusCancelled",
  },
  pending: {
    icon: Clock,
    color: "text-amber-500",
    label: "appConfig.statusPending",
  },
};

/** "" is fine (nothing set); anything else must be a full http(s) URL. */
const urlError = (value: string) => !!value.trim() && !isHttpUrl(value.trim());

function ConfigForm({
  config,
  canEdit,
}: {
  config: AppConfig;
  canEdit: boolean;
}) {
  const t = useT();
  const [save, { isLoading }] = useSaveAppConfigMutation();
  const [webhooks, setWebhooks] = useState<string[]>(
    config.webhooks.map((w) => w.url),
  );
  const [redirects, setRedirects] = useState<Record<RedirectStatus, string>>(
    () => {
      const byStatus = Object.fromEntries(
        REDIRECT_STATUSES.map((s) => [s, ""]),
      ) as Record<RedirectStatus, string>;
      for (const r of config.redirects) byStatus[r.status] = r.url;
      return byStatus;
    },
  );

  const trimmedHooks = webhooks.map((w) => w.trim());
  const duplicate = (i: number) =>
    !!trimmedHooks[i] && trimmedHooks.indexOf(trimmedHooks[i]) !== i;
  const invalid =
    webhooks.some((w, i) => urlError(w) || duplicate(i)) ||
    REDIRECT_STATUSES.some((s) => urlError(redirects[s]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    try {
      const res = await save({
        id: config.app.id,
        webhooks: trimmedHooks.filter(Boolean).map((url) => ({ url })),
        redirects: REDIRECT_STATUSES.filter((s) => redirects[s].trim()).map(
          (status) => ({
            status,
            url: redirects[status].trim(),
          }),
        ),
      }).unwrap();
      toast.success(res.message);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <form noValidate onSubmit={submit} className="grid gap-6">
      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="size-4" /> {t("appConfig.webhooks")}
          </CardTitle>
          <CardDescription>
            {t("appConfig.webhooksDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {webhooks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("appConfig.noWebhooks")}
            </p>
          )}
          {webhooks.map((url, i) => (
            <div key={i} className="grid gap-1">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t("appConfig.webhookUrl")}
                  className="font-mono text-sm"
                  placeholder="https://example.com/webhooks/pay"
                  readOnly={!canEdit}
                  aria-invalid={urlError(url) || duplicate(i)}
                  value={url}
                  onChange={(e) =>
                    setWebhooks(
                      webhooks.map((w, j) => (j === i ? e.target.value : w)),
                    )
                  }
                />
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.delete")}
                    onClick={() =>
                      setWebhooks(webhooks.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              {urlError(url) && (
                <p className="text-xs text-destructive">
                  {t("appConfig.urlInvalid")}
                </p>
              )}
              {duplicate(i) && (
                <p className="text-xs text-destructive">
                  {t("appConfig.webhookDuplicate")}
                </p>
              )}
            </div>
          ))}
          {canEdit && webhooks.length < MAX_WEBHOOKS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setWebhooks([...webhooks, ""])}
            >
              <Plus /> {t("appConfig.addWebhook")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Redirects: one URL per payment status */}
      <Card>
        <CardHeader>
          <CardTitle>{t("appConfig.redirects")}</CardTitle>
          <CardDescription>
            {t("appConfig.redirectsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {REDIRECT_STATUSES.map((status) => {
            const { icon: Icon, color, label } = STATUS_UI[status];
            return (
              <div
                key={status}
                className="grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:items-start sm:gap-4"
              >
                <Label
                  htmlFor={`redirect-${status}`}
                  className="flex items-center gap-2 sm:h-9"
                >
                  <Icon className={`size-4 ${color}`} /> {t(label)}
                </Label>
                <div className="grid gap-1">
                  <Input
                    id={`redirect-${status}`}
                    className="font-mono text-sm"
                    placeholder={`https://example.com/payment/${status}`}
                    readOnly={!canEdit}
                    aria-invalid={urlError(redirects[status])}
                    value={redirects[status]}
                    onChange={(e) =>
                      setRedirects({ ...redirects, [status]: e.target.value })
                    }
                  />
                  {urlError(redirects[status]) && (
                    <p className="text-xs text-destructive">
                      {t("appConfig.urlInvalid")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isLoading || invalid}>
            {isLoading && <Loader2 className="animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      )}
    </form>
  );
}

export default function AppConfigPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const appId = Number(id);
  const { can } = useAccess();
  const { data, isLoading, isError } = useAppConfigQuery(appId, {
    skip: !Number.isInteger(appId) || appId < 1,
  });

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        nativeButton={false}
        render={<Link href="/apps" />}
      >
        <ArrowLeft /> {t("appConfig.back")}
      </Button>
      <PageHeader
        title={data ? data.app.name : t("appConfig.title")}
        description={t("appConfig.description")}
      >
        {data && (
          <Badge variant="secondary" className="gap-1 font-mono">
            {data.app.kind === "domain" ? (
              <Globe className="size-3" />
            ) : (
              <Smartphone className="size-3" />
            )}
            {data.app.identifier}
          </Badge>
        )}
      </PageHeader>
      {isLoading && <Skeleton className="h-64" />}
      {isError && !data && (
        <p className="text-sm text-muted-foreground">
          {t("appConfig.notFound")}
        </p>
      )}
      {data && (
        <ConfigForm
          key={data.app.id}
          config={data}
          canEdit={can("apps.updateConfig")}
        />
      )}
    </div>
  );
}
