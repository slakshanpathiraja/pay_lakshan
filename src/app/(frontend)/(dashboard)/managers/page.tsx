"use client";

import { useState } from "react";
import {
  Building2,
  CircleCheck,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Trash2,
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
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PasswordInput } from "@/components/app/password-input";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import { useAccess } from "@/hooks/use-access";
import { isSuperAdminUser, roleLabel } from "@/lib/role-label";
import { RoleSelect } from "@/components/app/role-select";
import { StatusSwitch } from "@/components/app/status-switch";
import { InviteView, inviteMessage } from "@/components/app/invite-view";
import {
  useCreateManagerMutation,
  useDeleteManagerMutation,
  useResetManagerPasswordMutation,
  useSetManagerStatusMutation,
  useUpdateUserRoleMutation,
  useUsersQuery,
} from "@/store/api";
import type { User } from "@/store/types";

const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;

function FormError({ error }: { error: TranslationKey | null }) {
  const t = useT();
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{t(error)}</AlertDescription>
    </Alert>
  );
}

/** Picks the platform a new manager is added to (only offered to super admins / Platforms card holders). */
function PlatformSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { me } = useAccess();
  const items = (me?.platforms ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => v && onChange(v as string)}
    >
      <SelectTrigger id="newPlatform" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <Building2 className="size-4 text-muted-foreground" /> {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  const { me, can, isSuperAdmin } = useAccess();
  const [createManager, { isLoading }] = useCreateManagerMutation();
  // Super admins and Platforms card holders choose the platform; others add to their current one.
  const canPickPlatform = isSuperAdmin || can("platforms.list");
  const [platformId, setPlatformId] = useState<string | null>(
    me?.platform_id ?? null,
  );
  const [username, setUsername] = useState("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const platformName =
    me?.platforms.find((p) => p.id === platformId)?.name ??
    me?.platform_name ??
    "";

  const close = () => {
    onOpenChange(false);
    setUsername("");
    setRoleId(null);
    setPlatformId(me?.platform_id ?? null);
    setError(null);
    setInvite(null);
    setAdded(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim().toLowerCase();
    if (!USERNAME_RE.test(name)) return setError("validation.usernameInvalid");
    if (!platformId) return setError("errors.NO_PLATFORM");
    if (!roleId) return setError("validation.roleRequired");
    try {
      const { user, temporaryPassword } = await createManager({
        username: name,
        roleId,
        platformId: platformId !== me?.platform_id ? platformId : undefined,
      }).unwrap();
      setError(null);
      if (temporaryPassword) {
        setInvite(inviteMessage(t, user.username, temporaryPassword));
        toast.success(t("managers.created"));
      } else {
        // an existing account was added to this platform — it keeps its password
        setAdded(
          t("managers.addedExisting", {
            name: user.username,
            platform: platformName,
          }),
        );
        toast.success(t("managers.added"));
      }
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
    >
      <DialogContent>
        {invite ? (
          <InviteView
            title={t("managers.inviteTitle")}
            message={invite}
            onDone={close}
          />
        ) : added ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CircleCheck className="size-5 text-emerald-500" />
                {t("managers.added")}
              </DialogTitle>
              <DialogDescription>{added}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={close}>
                {t("managers.done")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("managers.addTitle")}</DialogTitle>
              <DialogDescription>
                {t("managers.addDescription")}
              </DialogDescription>
            </DialogHeader>
            <FormError error={error} />
            <div className="grid gap-2">
              <Label htmlFor="newUsername">{t("managers.username")}</Label>
              <Input
                id="newUsername"
                required
                autoFocus
                autoComplete="off"
                maxLength={50}
                placeholder={t("managers.usernamePlaceholder")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPlatform">{t("platforms.platform")}</Label>
              {canPickPlatform ? (
                <PlatformSelect
                  value={platformId}
                  onChange={(id) => {
                    setPlatformId(id);
                    setRoleId(null); // roles belong to a platform
                  }}
                />
              ) : (
                <div className="flex h-8 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm">
                  <Building2 className="size-4 text-muted-foreground" />{" "}
                  {platformName}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("managers.platformHint")}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newRole">{t("managers.role")}</Label>
              <RoleSelect
                key={platformId ?? "none"}
                id="newRole"
                platformId={platformId ?? undefined}
                value={roleId}
                onChange={setRoleId}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !username.trim() || !roleId}
              >
                {isLoading && <Loader2 className="animate-spin" />}
                {t("managers.createAccount")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const t = useT();
  const [resetPassword, { isLoading }] = useResetManagerPasswordMutation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<TranslationKey | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  const close = () => {
    onClose();
    setPassword("");
    setError(null);
    setInvite(null);
  };

  // No strength rules here: it's temporary and must be replaced on next sign in.
  // Empty = the server generates a strong one.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const { temporaryPassword } = await resetPassword({
        id: user.id,
        password: password || undefined,
      }).unwrap();
      setError(null);
      setInvite(inviteMessage(t, user.username, temporaryPassword));
      toast.success(t("managers.passwordReset"));
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        {invite ? (
          <InviteView
            title={t("managers.passwordReset")}
            message={invite}
            onDone={close}
          />
        ) : (
          <form noValidate onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {t("managers.resetTitle", {
                  name: user?.full_name || user?.username || "",
                })}
              </DialogTitle>
              <DialogDescription>
                {t("managers.resetDescription")}
              </DialogDescription>
            </DialogHeader>
            <FormError error={error} />
            <div className="grid gap-2">
              <Label htmlFor="resetPassword">
                {t("managers.tempPassword")}
              </Label>
              <PasswordInput
                id="resetPassword"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                placeholder={t("managers.tempPasswordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("managers.tempPasswordHint")}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="animate-spin" />}
                {t("managers.resetPassword")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const t = useT();
  const [updateRole, { isLoading }] = useUpdateUserRoleMutation();
  // null = untouched, so the picker starts on the user's current role
  const [roleId, setRoleId] = useState<number | null>(null);
  const value = roleId ?? user?.role_id ?? null;

  const close = () => {
    onClose();
    setRoleId(null);
  };

  const save = async () => {
    if (!user || !value) return;
    try {
      await updateRole({ id: user.id, roleId: value }).unwrap();
      toast.success(t("managers.roleChanged"));
      close();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("managers.changeRoleTitle", {
              name: user?.full_name || user?.username || "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("managers.changeRoleDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="changeRole">{t("managers.role")}</Label>
          <RoleSelect id="changeRole" value={value} onChange={setRoleId} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={save}
            disabled={isLoading || !value || value === user?.role_id}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteManagerDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const t = useT();
  const [deleteManager, { isLoading }] = useDeleteManagerMutation();

  const confirm = async () => {
    if (!user) return;
    try {
      await deleteManager(user.id).unwrap();
      toast.success(t("managers.deleted"));
      onClose();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("managers.deleteTitle", {
              name: user?.full_name || user?.username || "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("managers.deleteDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={isLoading}>
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ManagersPage() {
  const t = useT();
  const { locale } = useLocale();
  const { me, isLoading: meLoading, can, isSuperAdmin } = useAccess();
  // Each action is shown only if the user's role grants its API endpoint.
  const canView = can("managers.list");
  const canCreate = can("managers.create");
  const canChangeRole = can("managers.updateRole");
  const canReset = can("managers.resetPassword");
  const canStatus = can("managers.updateStatus");
  const canDelete = can("managers.delete");
  // the status is a toggle in the table, so it's not in the row's action menu
  const canAct = canChangeRole || canReset || canDelete;
  const { data: users, isLoading } = useUsersQuery(undefined, {
    skip: !canView,
  });
  const [setStatus] = useSetManagerStatusMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  // Nothing manager-related renders until we know the user may see it.
  if (meLoading || !me) return <Skeleton className="h-64" />;
  if (!canView) {
    return (
      <Alert>
        <AlertDescription>{t("managers.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <CardTitle>{t("managers.title")}</CardTitle>
          <CardDescription>{t("managers.description")}</CardDescription>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> {t("managers.add")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("managers.user")}</TableHead>
              <TableHead>{t("dashboard.role")}</TableHead>
              <TableHead>{t("managers.status")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("managers.lastLogin")}
              </TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("common.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              ))}
            {users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-medium">
                    {user.full_name || user.username}
                    {user.id === me?.id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({t("managers.you")})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{user.username}
                    {user.email && <> · {user.email}</>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={isSuperAdminUser(user) ? "default" : "outline"}
                  >
                    {roleLabel(t, user)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusSwitch
                      active={user.is_active}
                      onChange={(isActive) =>
                        setStatus({ id: user.id, isActive }).unwrap()
                      }
                      disabledReason={
                        !canStatus
                          ? t("status.noPermission")
                          : user.id === me.id
                            ? t("errors.CANNOT_MODIFY_SELF")
                            : null
                      }
                    />
                    {user.must_change_password && (
                      <Badge variant="outline">
                        {t("managers.pendingChange")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {formatDateTime(
                    user.last_login_at,
                    locale,
                    t("common.never"),
                  )}
                </TableCell>
                <TableCell>
                  {(isSuperAdmin || !isSuperAdminUser(user)) &&
                    user.id !== me.id &&
                    canAct && (
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
                          {canChangeRole && (
                            <DropdownMenuItem
                              onClick={() => setRoleTarget(user)}
                            >
                              <ShieldCheck /> {t("managers.changeRole")}
                            </DropdownMenuItem>
                          )}
                          {canReset && (
                            <DropdownMenuItem
                              onClick={() => setResetTarget(user)}
                            >
                              <KeyRound /> {t("managers.resetPassword")}
                            </DropdownMenuItem>
                          )}
                          {(canChangeRole || canReset) && canDelete && (
                            <DropdownMenuSeparator />
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(user)}
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
            {users && users.every(isSuperAdminUser) && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t("managers.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {canCreate && (
        <CreateManagerDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
      <ChangeRoleDialog user={roleTarget} onClose={() => setRoleTarget(null)} />
      <ResetPasswordDialog
        user={resetTarget}
        onClose={() => setResetTarget(null)}
      />
      <DeleteManagerDialog
        user={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
