"use client";

import { useState } from "react";
import {
  CornerDownRight,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionBadges } from "@/components/app/action-badges";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { MethodBadge } from "@/components/app/method-badge";
import { PageHeader } from "@/components/app/page-header";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { orderAsTree, selfAndDescendants } from "@/lib/permission-tree";
import {
  ACTIONS,
  keyFromName,
  PERMISSION_KEY_RE,
  sortActions,
  type Action,
} from "@/lib/access";
import {
  useDeletePermissionMutation,
  usePermissionCatalogQuery,
  usePermissionsQuery,
  useSavePermissionMutation,
} from "@/store/api";
import type {
  HttpMethod,
  PermissionCard,
  PermissionCatalog,
  PermissionUrl,
} from "@/store/types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Suggested action for a new URL; can be changed with the checkboxes. */
const DEFAULT_ACTION: Record<HttpMethod, Action> = {
  GET: "view",
  POST: "create",
  PUT: "edit",
  PATCH: "edit",
  DELETE: "delete",
};

/** Same rules as the server: leading slash, no trailing slash, `:id` → `{id}`. */
function normalizePath(path: string) {
  let p = path
    .trim()
    .replace(/\s+/g, "")
    .replace(/:(\w+)/g, "{$1}");
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p;
}

const urlKey = (u: Pick<PermissionUrl, "kind" | "method" | "path">) =>
  `${u.kind} ${u.method ?? ""} ${u.path}`;

/** URL rows with one checkbox per action; the action names are the column headers. */
function UrlMatrix({
  icon: Icon,
  title,
  hint,
  urls,
  onChange,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  urls: PermissionUrl[];
  onChange: (urls: PermissionUrl[]) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const toggle = (url: PermissionUrl, action: Action) =>
    onChange(
      urls.map((u) =>
        u === url
          ? {
              ...u,
              actions: u.actions.includes(action)
                ? u.actions.filter((a) => a !== action)
                : sortActions([...u.actions, action]),
            }
          : u,
      ),
    );

  return (
    <section className="grid gap-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{title}</h3>
        <Badge variant="secondary">{urls.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">URL</th>
              {ACTIONS.map((a) => (
                <th key={a} className="w-16 px-1 py-2 text-center font-medium">
                  {t(`actions.${a}`)}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {urls.length === 0 && (
              <tr>
                <td
                  colSpan={ACTIONS.length + 2}
                  className="px-3 py-3 text-center text-xs text-muted-foreground"
                >
                  {t("permissions.noUrls")}
                </td>
              </tr>
            )}
            {urls.map((u) => (
              <tr
                key={urlKey(u)}
                className={
                  u.actions.length === 0 ? "bg-destructive/5" : undefined
                }
              >
                <td className="px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {u.method && <MethodBadge method={u.method} />}
                    <code className="truncate">{u.path}</code>
                  </div>
                </td>
                {ACTIONS.map((a) => (
                  <td key={a} className="px-1 text-center">
                    <Checkbox
                      checked={u.actions.includes(a)}
                      onCheckedChange={() => toggle(u, a)}
                      aria-label={`${u.method ?? ""} ${u.path} — ${t(`actions.${a}`)}`}
                    />
                  </td>
                ))}
                <td className="px-1 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("common.delete")}
                    onClick={() => onChange(urls.filter((x) => x !== u))}
                  >
                    <X />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const NO_PARENT = "none";

/** Picks the parent card; the card itself and its descendants are excluded (no loops). */
function ParentSelect({
  cards,
  cardId,
  value,
  onChange,
}: {
  cards: PermissionCard[];
  cardId?: number;
  value: number | null;
  onChange: (parentId: number | null) => void;
}) {
  const t = useT();
  const excluded = cardId
    ? selfAndDescendants(cards, cardId)
    : new Set<number>();
  const options = orderAsTree(cards).filter(
    ({ card }) => !excluded.has(card.id),
  );
  const items = [
    { value: NO_PARENT, label: t("permissions.noParent") },
    ...options.map(({ card }) => ({
      value: String(card.id),
      label: card.name,
    })),
  ];

  return (
    <Select
      items={items}
      value={value === null ? NO_PARENT : String(value)}
      onValueChange={(v) => onChange(!v || v === NO_PARENT ? null : Number(v))}
    >
      <SelectTrigger id="permParent" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PARENT}>
          <span className="text-muted-foreground">
            {t("permissions.noParent")}
          </span>
        </SelectItem>
        {options.map(({ card, depth }) => (
          <SelectItem key={card.id} value={String(card.id)}>
            <span
              className="flex w-full min-w-0 items-center gap-2"
              style={{ paddingLeft: depth * 16 }}
            >
              {depth > 0 && (
                <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{card.name}</span>
              <code className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                {card.key}
              </code>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PermissionDialog({
  permission,
  cards,
  catalog,
  onClose,
}: {
  permission: PermissionCard | null;
  /** all cards, for the parent picker */
  cards: PermissionCard[];
  catalog: PermissionCatalog;
  onClose: () => void;
}) {
  const t = useT();
  const [save, { isLoading }] = useSavePermissionMutation();
  const [name, setName] = useState(permission?.name ?? "");
  const [key, setKey] = useState(permission?.key ?? "");
  const [parentId, setParentId] = useState<number | null>(
    permission?.parent_id ?? null,
  );
  const [pages, setPages] = useState(
    permission?.urls.filter((u) => u.kind === "page") ?? [],
  );
  const [apis, setApis] = useState(
    permission?.urls.filter((u) => u.kind === "api") ?? [],
  );
  const [pageInput, setPageInput] = useState("");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [apiInput, setApiInput] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [error, setError] = useState<{
    key: TranslationKey;
    details?: string;
  } | null>(null);

  // Known URLs: used for typing suggestions and to catch typos before saving.
  const knownPages = new Set(catalog.pages.map((p) => p.path));
  const knownApis = new Set(
    catalog.endpoints.map((e) => `${e.method} ${e.path}`),
  );
  const apiPathsForMethod = [
    ...new Set(
      catalog.endpoints.filter((e) => e.method === method).map((e) => e.path),
    ),
  ];

  const addPage = () => {
    if (!pageInput.trim()) return;
    const path = normalizePath(pageInput);
    if (!knownPages.has(path))
      return setPageError(t("permissions.unknownPage", { url: path }));
    if (!pages.some((u) => u.path === path)) {
      setPages([
        ...pages,
        { kind: "page", method: null, path, actions: ["view"] },
      ]);
    }
    setPageInput("");
    setPageError(null);
  };

  const addApi = () => {
    if (!apiInput.trim()) return;
    const path = normalizePath(apiInput);
    if (!knownApis.has(`${method} ${path}`))
      return setApiError(
        t("permissions.unknownApi", { url: `${method} ${path}` }),
      );
    if (!apis.some((u) => u.method === method && u.path === path)) {
      setApis([
        ...apis,
        { kind: "api", method, path, actions: [DEFAULT_ACTION[method]] },
      ]);
    }
    setApiInput("");
    setApiError(null);
  };

  const onEnter = (add: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = [...pages, ...apis];
    if (!name.trim()) return setError({ key: "validation.required" });
    if (key.trim() && !PERMISSION_KEY_RE.test(key.trim()))
      return setError({ key: "validation.keyInvalid" });
    if (!urls.length) return setError({ key: "validation.permissionEmpty" });
    if (urls.some((u) => u.actions.length === 0))
      return setError({ key: "validation.urlNoAction" });
    try {
      // empty key = the server generates one from the name
      await save({
        id: permission?.id,
        key: key.trim() || undefined,
        name: name.trim(),
        parentId,
        urls,
      }).unwrap();
      toast.success(
        t(permission ? "permissions.updated" : "permissions.created"),
      );
      onClose();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <form noValidate onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>
              {t(permission ? "permissions.editTitle" : "permissions.newTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("permissions.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="grid gap-1">
                <span>{t(error.key)}</span>
                {error.details && (
                  <code className="text-xs break-all">{error.details}</code>
                )}
              </AlertDescription>
            </Alert>
          )}
          {/* One grid: labels share a row and inputs share a row, so the two fields always line up. */}
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Label htmlFor="permName" className="sm:col-start-1 sm:row-start-1">
              {t("permissions.name")}
            </Label>
            <Input
              id="permName"
              autoFocus
              maxLength={80}
              className="sm:col-start-1 sm:row-start-2"
              placeholder={t("permissions.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Label
              htmlFor="permKey"
              className="mt-2 sm:col-start-2 sm:row-start-1 sm:mt-0"
            >
              {t("permissions.key")}
            </Label>
            <Input
              id="permKey"
              maxLength={80}
              className="font-mono sm:col-start-2 sm:row-start-2"
              autoComplete="off"
              // shows the key that will be generated when left empty
              placeholder={name.trim() ? keyFromName(name) : "managers"}
              value={key}
              onChange={(e) =>
                setKey(e.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
            />
            <p className="text-xs text-muted-foreground sm:col-start-2 sm:row-start-3">
              {t("permissions.keyHint")}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="permParent">{t("permissions.parent")}</Label>
            <ParentSelect
              cards={cards}
              cardId={permission?.id}
              value={parentId}
              onChange={setParentId}
            />
            <p className="text-xs text-muted-foreground">
              {t("permissions.parentHint")}
            </p>
          </div>

          <UrlMatrix
            icon={FileText}
            title={t("permissions.frontendPages")}
            hint={t("permissions.frontendHint")}
            urls={pages}
            onChange={setPages}
          >
            <div className="grid gap-1">
              <div className="flex gap-2">
                <Input
                  list="known-pages"
                  className="font-mono"
                  placeholder="/managers"
                  aria-label={t("permissions.frontendPages")}
                  value={pageInput}
                  onChange={(e) => {
                    setPageInput(e.target.value);
                    setPageError(null);
                  }}
                  onKeyDown={onEnter(addPage)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addPage}
                  disabled={!pageInput.trim()}
                >
                  <Plus /> {t("permissions.add")}
                </Button>
              </div>
              {pageError && (
                <p className="text-xs text-destructive">{pageError}</p>
              )}
              <datalist id="known-pages">
                {catalog.pages.map((p) => (
                  <option key={p.path} value={p.path} />
                ))}
              </datalist>
            </div>
          </UrlMatrix>

          <UrlMatrix
            icon={Server}
            title={t("permissions.backendApis")}
            hint={t("permissions.backendHint")}
            urls={apis}
            onChange={setApis}
          >
            <div className="grid gap-1">
              <div className="flex gap-2">
                <Select
                  items={METHODS.map((m) => ({ value: m, label: m }))}
                  value={method}
                  onValueChange={(v) => v && setMethod(v as HttpMethod)}
                >
                  <SelectTrigger
                    className="w-28 shrink-0 font-mono"
                    aria-label="HTTP method"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m} className="font-mono">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  list="known-apis"
                  className="font-mono"
                  placeholder="/api/managers/{id}"
                  aria-label={t("permissions.backendApis")}
                  value={apiInput}
                  onChange={(e) => {
                    setApiInput(e.target.value);
                    setApiError(null);
                  }}
                  onKeyDown={onEnter(addApi)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addApi}
                  disabled={!apiInput.trim()}
                >
                  <Plus /> {t("permissions.add")}
                </Button>
              </div>
              {apiError && (
                <p className="text-xs text-destructive">{apiError}</p>
              )}
              <datalist id="known-apis">
                {apiPathsForMethod.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </UrlMatrix>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="animate-spin" />}
              {t(permission ? "common.save" : "common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UrlRows({ urls }: { urls: PermissionUrl[] }) {
  if (urls.length === 0)
    return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <ul className="grid gap-1">
      {urls.map((u) => (
        <li key={urlKey(u)} className="flex items-center gap-2">
          {u.method && <MethodBadge method={u.method} />}
          <code className="min-w-0 flex-1 truncate text-xs">{u.path}</code>
          <ActionBadges actions={u.actions} className="shrink-0" />
        </li>
      ))}
    </ul>
  );
}

export default function PermissionsPage() {
  const t = useT();
  const { data: permissions, isLoading } = usePermissionsQuery();
  const { data: catalog } = usePermissionCatalogQuery();
  const [deletePermission, { isLoading: deleting }] =
    useDeletePermissionMutation();
  const [editing, setEditing] = useState<PermissionCard | null | undefined>(
    undefined,
  );
  const [toDelete, setToDelete] = useState<PermissionCard | null>(null);
  const parentName = new Map((permissions ?? []).map((p) => [p.id, p.name]));

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deletePermission(toDelete.id).unwrap();
      toast.success(t("permissions.deleted"));
      setToDelete(null);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        title={t("permissions.title")}
        description={t("permissions.pageDescription")}
      >
        <Button onClick={() => setEditing(null)} disabled={!catalog}>
          <Plus /> {t("permissions.new")}
        </Button>
      </PageHeader>

      {!isLoading && permissions?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ShieldCheck className="size-6 text-muted-foreground" />
            </span>
            <p className="font-medium">{t("permissions.emptyTitle")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("permissions.emptyText")}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {isLoading &&
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        {orderAsTree(permissions ?? []).map(({ card: p }) => {
          const pages = p.urls.filter((u) => u.kind === "page");
          const apis = p.urls.filter((u) => u.kind === "api");
          return (
            <Card key={p.id} className="flex flex-col">
              <CardHeader>
                {p.parent_id !== null && parentName.get(p.parent_id) && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CornerDownRight className="size-3" />
                    {t("permissions.childOf", {
                      name: parentName.get(p.parent_id)!,
                    })}
                  </p>
                )}
                <CardTitle className="flex items-center gap-2">
                  <span className="truncate">{p.name}</span>
                  <code className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                    {p.key}
                  </code>
                </CardTitle>
                <ActionBadges actions={p.actions} className="pt-1" />
              </CardHeader>
              <CardContent className="grid flex-1 content-start gap-4">
                <div className="grid gap-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileText className="size-3.5" />{" "}
                    {t("permissions.frontendPages")} ({pages.length})
                  </p>
                  <UrlRows urls={pages} />
                </div>
                <div className="grid gap-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Server className="size-3.5" />{" "}
                    {t("permissions.backendApis")} ({apis.length})
                  </p>
                  <UrlRows urls={apis} />
                </div>
              </CardContent>
              <CardFooter className="justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("permissions.usedBy", { count: p.role_count })}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setToDelete(p)}
                  >
                    <Trash2 /> {t("common.delete")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(p)}
                    disabled={!catalog}
                  >
                    <Pencil /> {t("common.edit")}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {editing !== undefined && catalog && (
        <PermissionDialog
          key={editing?.id ?? "new"}
          permission={editing}
          cards={permissions ?? []}
          catalog={catalog}
          onClose={() => setEditing(undefined)}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t("permissions.deleteTitle", { name: toDelete?.name ?? "" })}
        description={t("permissions.deleteDescription", {
          count: toDelete?.role_count ?? 0,
        })}
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
