"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AppWindow,
  CircleCheck,
  Eye,
  Globe,
  Loader2,
  MoreHorizontal,
  Pencil,
  Settings2,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyField } from "@/components/app/copy-field";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { allPages } from "@/utils/menu";
import {
  useAppCredentialsQuery,
  useAppsQuery,
  useDeleteAppMutation,
  useSaveAppMutation,
} from "@/store/api";
import type { AppCredentials, AppItem } from "@/store/types";

type Kind = AppItem["kind"];

// Same rules as the API (src/server/schemas.ts).
const PATTERNS: Record<Kind, RegExp> = {
  domain:
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
  app_id: /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/,
};

/** "https://Shop.Example.com/path" → "shop.example.com" (people often paste a URL). */
function cleanDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/:?#].*$/, "");
}

const KINDS: {
  kind: Kind;
  icon: typeof Globe;
  label: TranslationKey;
  placeholder: string;
  hint: TranslationKey;
}[] = [
  {
    kind: "domain",
    icon: Globe,
    label: "apps.domain",
    placeholder: "shop.example.com",
    hint: "apps.domainHint",
  },
  {
    kind: "app_id",
    icon: Smartphone,
    label: "apps.appId",
    placeholder: "com.example.shop",
    hint: "apps.appIdHint",
  },
];

function CredentialsBody({
  name,
  credentials,
  created,
}: {
  name: string;
  credentials: AppCredentials;
  created?: boolean;
}) {
  const t = useT();
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {created && <CircleCheck className="size-5 text-emerald-500" />}
          {t(created ? "apps.createdTitle" : "apps.credentialsTitle", { name })}
        </DialogTitle>
        <DialogDescription>
          {t("apps.credentialsDescription")}
        </DialogDescription>
      </DialogHeader>
      <CopyField label={t("apps.appKey")} value={credentials.appKey} />
      <CopyField
        label={t("apps.appSecret")}
        value={credentials.appSecret}
        secret
      />
    </>
  );
}

/** The full key and secret: right after creating (from the create response) or via View (fetched). */
function CredentialsDialog({
  app,
  created,
  onClose,
}: {
  app: Pick<AppItem, "id" | "name">;
  created?: AppCredentials;
  onClose: () => void;
}) {
  const t = useT();
  const { data, isFetching } = useAppCredentialsQuery(app.id, {
    skip: !!created,
    refetchOnMountOrArgChange: true,
  });
  const credentials = created ?? data?.credentials;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <div className="grid min-w-0 gap-4">
          {credentials ? (
            <CredentialsBody
              name={app.name}
              credentials={credentials}
              created={!!created}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t("apps.credentialsTitle", { name: app.name })}
                </DialogTitle>
                <DialogDescription>
                  {t("apps.credentialsDescription")}
                </DialogDescription>
              </DialogHeader>
              {isFetching ? <Skeleton className="h-28" /> : null}
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("managers.done")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppDialog({
  app,
  onClose,
  onCreated,
}: {
  app: AppItem | null;
  onClose: () => void;
  onCreated: (app: AppItem, credentials: AppCredentials) => void;
}) {
  const t = useT();
  const [save, { isLoading }] = useSaveAppMutation();
  const [name, setName] = useState(app?.name ?? "");
  const [kind, setKind] = useState<Kind>(app?.kind ?? "domain");
  const [value, setValue] = useState(app?.identifier ?? "");
  const [touched, setTouched] = useState(false);

  const identifier = kind === "domain" ? cleanDomain(value) : value.trim();
  const valid = PATTERNS[kind].test(identifier);
  const current = KINDS.find((k) => k.kind === kind)!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !name.trim()) return;
    try {
      const res = await save({
        id: app?.id,
        name: name.trim(),
        kind,
        identifier,
      }).unwrap();
      toast.success(res.message);
      // a new app: show its generated key and secret
      if (res.credentials) onCreated(res.app, res.credentials);
      else onClose();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {t(app ? "apps.editTitle" : "apps.newTitle")}
            </DialogTitle>
            <DialogDescription>{t("apps.dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="appName">{t("apps.name")}</Label>
            <Input
              id="appName"
              autoFocus
              maxLength={80}
              placeholder={t("apps.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Domain (website) or app id (mobile app) */}
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label={t("apps.type")}
          >
            {KINDS.map(({ kind: k, icon: Icon, label }) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setTouched(false);
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                  kind === k
                    ? "border-primary bg-primary/5 text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" /> {t(label)}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="appIdentifier">{t(current.label)}</Label>
            <Input
              id="appIdentifier"
              autoComplete="off"
              className="font-mono"
              placeholder={current.placeholder}
              aria-invalid={touched && !valid}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            {touched && !valid ? (
              <p className="text-xs text-destructive">
                {t(
                  kind === "domain"
                    ? "apps.domainInvalid"
                    : "apps.appIdInvalid",
                )}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t(current.hint)}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !value.trim() || !name.trim()}
            >
              {isLoading && <Loader2 className="animate-spin" />}
              {t(app ? "common.save" : "common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AppsPage() {
  const t = useT();
  const { locale } = useLocale();
  const { me, can, canPage } = useAccess();
  const { data: apps, isLoading } = useAppsQuery();
  const [remove, { isLoading: deleting }] = useDeleteAppMutation();
  // `editing` undefined = closed, null = new app
  const [editing, setEditing] = useState<AppItem | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<AppItem | null>(null);
  // the credentials dialog: `created` = the full values from the create response
  const [shown, setShown] = useState<{
    app: AppItem;
    created?: AppCredentials;
  } | null>(null);
  const canView = can("apps.credentials");
  const configPage = allPages.find((p) => p.key === "app-config");
  const canConfig = !!configPage && canPage(configPage);
  const canEdit = can("apps.update");
  const canDelete = can("apps.delete");

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove(toDelete.id).unwrap();
      toast.success(t("apps.deleted"));
      setToDelete(null);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        title={t("apps.title")}
        description={t("apps.pageDescription", {
          platform: me?.platform_name ?? "",
        })}
      >
        {can("apps.create") && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> {t("apps.new")}
          </Button>
        )}
      </PageHeader>

      {!me?.platform_id && (
        <Alert>
          <AlertDescription>{t("errors.NO_PLATFORM")}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("apps.name")}</TableHead>
                <TableHead>{t("apps.identifier")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("apps.appKey")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("apps.appSecret")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("apps.added")}
                </TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {apps?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <AppWindow className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-medium">{t("apps.emptyTitle")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("apps.emptyText")}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {apps?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="grid gap-1">
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="secondary" className="w-fit gap-1">
                        {a.kind === "domain" ? (
                          <Globe className="size-3" />
                        ) : (
                          <Smartphone className="size-3" />
                        )}
                        {t(
                          a.kind === "domain"
                            ? "apps.website"
                            : "apps.mobileApp",
                        )}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm">{a.identifier}</code>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                    {a.app_key}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                    {a.app_secret}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {formatDateTime(a.created_at, locale, "—")}
                  </TableCell>
                  <TableCell>
                    {(canView || canConfig || canEdit || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("common.actions")}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canView && (
                            <DropdownMenuItem
                              onClick={() => setShown({ app: a })}
                            >
                              <Eye /> {t("apps.view")}
                            </DropdownMenuItem>
                          )}
                          {canConfig && (
                            <DropdownMenuItem
                              render={<Link href={`/apps/config/${a.id}`} />}
                            >
                              <Settings2 /> {t("menu.appConfig")}
                            </DropdownMenuItem>
                          )}
                          {canEdit && (
                            <DropdownMenuItem onClick={() => setEditing(a)}>
                              <Pencil /> {t("common.edit")}
                            </DropdownMenuItem>
                          )}
                          {(canView || canConfig || canEdit) && canDelete && (
                            <DropdownMenuSeparator />
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setToDelete(a)}
                            >
                              <Trash2 /> {t("common.delete")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing !== undefined && (
        <AppDialog
          key={editing?.id ?? "new"}
          app={editing}
          onClose={() => setEditing(undefined)}
          onCreated={(app, created) => {
            setEditing(undefined);
            setShown({ app, created });
          }}
        />
      )}
      {shown && (
        <CredentialsDialog
          app={shown.app}
          created={shown.created}
          onClose={() => setShown(null)}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t("apps.deleteTitle", { name: toDelete?.name ?? "" })}
        description={t("apps.deleteDescription")}
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
