"use client";

import { useState } from "react";
import {
  CircleCheck,
  CircleX,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Star,
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusSwitch } from "@/components/app/status-switch";
import { PasswordInput } from "@/components/app/password-input";
import { useAccess } from "@/hooks/use-access";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  errorCode,
  errorDetails,
  useDeleteSmtpServerMutation,
  useSetSmtpStatusMutation,
  useSaveSmtpServerMutation,
  useSmtpServersQuery,
  useTestSmtpServerMutation,
} from "@/store/api";
import type { SmtpServer } from "@/store/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SmtpDialog({
  server,
  onClose,
}: {
  server: SmtpServer | null;
  onClose: () => void;
}) {
  const t = useT();
  const [save, { isLoading }] = useSaveSmtpServerMutation();
  const [form, setForm] = useState({
    name: server?.name ?? "",
    host: server?.host ?? "",
    port: String(server?.port ?? 587),
    secure: server?.secure ?? false,
    username: server?.username ?? "",
    password: "",
    fromEmail: server?.from_email ?? "",
    fromName: server?.from_name ?? "",
    isDefault: server?.is_default ?? false,
    isActive: server?.is_active ?? true,
  });
  const [error, setError] = useState<TranslationKey | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const port = Number(form.port);
    if (!form.name.trim() || !form.host.trim())
      return setError("validation.required");
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      return setError("validation.portInvalid");
    if (!EMAIL_RE.test(form.fromEmail.trim()))
      return setError("validation.emailInvalid");
    try {
      await save({
        id: server?.id,
        name: form.name.trim(),
        host: form.host.trim(),
        port,
        secure: form.secure,
        username: form.username.trim(),
        // editing: leave empty to keep the stored password
        password: server && !form.password ? undefined : form.password,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName.trim(),
        isDefault: form.isDefault,
        isActive: form.isActive,
      }).unwrap();
      toast.success(t(server ? "smtp.updated" : "smtp.created"));
      onClose();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {t(server ? "smtp.editTitle" : "smtp.newTitle")}
            </DialogTitle>
            <DialogDescription>{t("smtp.dialogDescription")}</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="smtpName">{t("smtp.name")}</Label>
            <Input
              id="smtpName"
              autoFocus
              maxLength={80}
              placeholder={t("smtp.namePlaceholder")}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div className="grid gap-2">
              <Label htmlFor="smtpHost">{t("smtp.host")}</Label>
              <Input
                id="smtpHost"
                placeholder="smtp.gmail.com"
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtpPort">{t("smtp.port")}</Label>
              <Input
                id="smtpPort"
                inputMode="numeric"
                value={form.port}
                onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <ToggleRow
            id="smtpSecure"
            label={t("smtp.secure")}
            hint={t("smtp.secureHint")}
            checked={form.secure}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                secure: v,
                port:
                  v && f.port === "587"
                    ? "465"
                    : !v && f.port === "465"
                      ? "587"
                      : f.port,
              }))
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="smtpUser">{t("smtp.username")}</Label>
              <Input
                id="smtpUser"
                autoComplete="off"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtpPass">{t("smtp.password")}</Label>
              <PasswordInput
                id="smtpPass"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                placeholder={server?.has_password ? t("smtp.passwordKeep") : ""}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="smtpFrom">{t("smtp.fromEmail")}</Label>
              <Input
                id="smtpFrom"
                type="email"
                placeholder="no-reply@example.com"
                value={form.fromEmail}
                onChange={(e) => set("fromEmail", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtpFromName">{t("smtp.fromName")}</Label>
              <Input
                id="smtpFromName"
                placeholder="Pay Portal"
                value={form.fromName}
                onChange={(e) => set("fromName", e.target.value)}
              />
            </div>
          </div>
          <ToggleRow
            id="smtpDefault"
            label={t("smtp.default")}
            hint={t("smtp.defaultHint")}
            checked={form.isDefault}
            onChange={(v) => set("isDefault", v)}
          />
          <ToggleRow
            id="smtpActive"
            label={t("smtp.active")}
            hint={t("smtp.activeHint")}
            checked={form.isActive}
            onChange={(v) => set("isActive", v)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="animate-spin" />}
              {t(server ? "common.save" : "common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({
  server,
  onClose,
}: {
  server: SmtpServer;
  onClose: () => void;
}) {
  const t = useT();
  const [test, { isLoading }] = useTestSmtpServerMutation();
  const [to, setTo] = useState("");
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    detail?: string | null;
  } | null>(null);

  const run = async () => {
    if (to && !EMAIL_RE.test(to.trim())) {
      return setResult({ ok: false, message: t("validation.emailInvalid") });
    }
    setResult(null);
    try {
      const res = await test({
        id: server.id,
        to: to.trim() || undefined,
      }).unwrap();
      setResult({
        ok: true,
        message: t(res.sent ? "smtp.testSent" : "smtp.testOk", {
          to: to.trim(),
        }),
      });
    } catch (err) {
      setResult({
        ok: false,
        message: t(`errors.${errorCode(err)}` as TranslationKey),
        detail: errorDetails(err),
      });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("smtp.testTitle", { name: server.name })}
          </DialogTitle>
          <DialogDescription>{t("smtp.testDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="testTo">{t("smtp.testTo")}</Label>
          <Input
            id="testTo"
            type="email"
            placeholder="you@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {result && (
          <Alert variant={result.ok ? "default" : "destructive"}>
            <AlertDescription className="grid gap-1">
              <span className="flex items-center gap-1.5 font-medium">
                {result.ok ? (
                  <CircleCheck className="size-4 text-emerald-500" />
                ) : (
                  <CircleX className="size-4" />
                )}
                {result.message}
              </span>
              {result.detail && (
                <code className="text-xs break-all opacity-80">
                  {result.detail}
                </code>
              )}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button onClick={run} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : <Send />}
            {t("smtp.runTest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SmtpServersPage() {
  const t = useT();
  const { can } = useAccess();
  const { data: servers, isLoading } = useSmtpServersQuery();
  const [save] = useSaveSmtpServerMutation();
  const [remove, { isLoading: deleting }] = useDeleteSmtpServerMutation();
  const [setStatus] = useSetSmtpStatusMutation();
  const [editing, setEditing] = useState<SmtpServer | null | undefined>(
    undefined,
  );
  const [testing, setTesting] = useState<SmtpServer | null>(null);
  const [toDelete, setToDelete] = useState<SmtpServer | null>(null);

  const makeDefault = async (s: SmtpServer) => {
    try {
      await save({
        id: s.id,
        name: s.name,
        host: s.host,
        port: s.port,
        secure: s.secure,
        username: s.username ?? "",
        fromEmail: s.from_email,
        fromName: s.from_name ?? "",
        isDefault: true,
        isActive: s.is_active,
      }).unwrap();
      toast.success(t("smtp.updated"));
    } catch {
      // the API error middleware shows the error
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove(toDelete.id).unwrap();
      toast.success(t("smtp.deleted"));
      setToDelete(null);
    } catch {
      // the API error middleware shows the error
    }
  };

  const canEdit = can("smtp.update");
  const canTest = can("smtp.test");
  const canDelete = can("smtp.delete");

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        title={t("smtp.title")}
        description={t("smtp.pageDescription")}
      >
        {can("smtp.create") && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> {t("smtp.new")}
          </Button>
        )}
      </PageHeader>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("smtp.name")}</TableHead>
                <TableHead>{t("smtp.server")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("smtp.fromEmail")}
                </TableHead>
                <TableHead>{t("status.title")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {servers?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <Mail className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-medium">{t("smtp.emptyTitle")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("smtp.emptyText")}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {servers?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {s.name}
                      {s.is_default && (
                        <Badge variant="secondary" className="gap-1">
                          <Star className="size-3" /> {t("smtp.defaultBadge")}
                        </Badge>
                      )}
                    </div>
                    {s.username && (
                      <div className="text-xs text-muted-foreground">
                        {s.username}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">
                      {s.host}:{s.port}
                    </code>
                    <div className="text-xs text-muted-foreground">
                      {s.secure ? "SSL/TLS" : "STARTTLS"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {s.from_name
                      ? `${s.from_name} <${s.from_email}>`
                      : s.from_email}
                  </TableCell>
                  <TableCell>
                    <StatusSwitch
                      active={s.is_active}
                      onChange={(isActive) =>
                        setStatus({ id: s.id, isActive }).unwrap()
                      }
                      disabledReason={
                        can("smtp.updateStatus")
                          ? null
                          : t("status.noPermission")
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {(canEdit || canTest || canDelete) && (
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
                          {canTest && (
                            <DropdownMenuItem onClick={() => setTesting(s)}>
                              <Send /> {t("smtp.test")}
                            </DropdownMenuItem>
                          )}
                          {canEdit && (
                            <DropdownMenuItem onClick={() => setEditing(s)}>
                              <Pencil /> {t("common.edit")}
                            </DropdownMenuItem>
                          )}
                          {canEdit && !s.is_default && (
                            <DropdownMenuItem onClick={() => makeDefault(s)}>
                              <Star /> {t("smtp.makeDefault")}
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setToDelete(s)}
                              >
                                <Trash2 /> {t("common.delete")}
                              </DropdownMenuItem>
                            </>
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
        <SmtpDialog
          key={editing?.id ?? "new"}
          server={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {testing && (
        <TestDialog server={testing} onClose={() => setTesting(null)} />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t("smtp.deleteTitle", { name: toDelete?.name ?? "" })}
        description={t("smtp.deleteDescription")}
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
