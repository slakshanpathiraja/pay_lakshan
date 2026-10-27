"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CornerDownRight,
  Crown,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
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
import { Skeleton } from "@/components/ui/skeleton";
import { ActionBadges } from "@/components/app/action-badges";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { StatusSwitch } from "@/components/app/status-switch";
import { useAccess } from "@/hooks/use-access";
import { PageHeader } from "@/components/app/page-header";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  ACTIONS,
  actionsUpTo,
  sortActions,
  topAction,
  type Action,
} from "@/lib/access";
import { orderAsTree } from "@/lib/permission-tree";
import { roleName } from "@/lib/role-label";
import { cn } from "@/lib/utils";
import {
  useDeleteRoleMutation,
  usePermissionsQuery,
  useRolesQuery,
  useSaveRoleMutation,
  useSetRoleStatusMutation,
} from "@/store/api";
import type { PermissionCard, RoleItem } from "@/store/types";

type Grants = Map<number, Action[]>;

/**
 * Create / edit a role: its name and the role × card × action matrix — for each
 * permission card, which of the actions it offers this role gets.
 */
function RoleDialog({
  role,
  permissions,
  onClose,
}: {
  role: RoleItem | null;
  permissions: PermissionCard[];
  onClose: () => void;
}) {
  const t = useT();
  const [saveRole, { isLoading }] = useSaveRoleMutation();
  const [name, setName] = useState(role?.name ?? "");
  const initial = new Map(
    role?.grants.map((g) => [g.permission_id, g.actions]) ?? [],
  );
  const [grants, setGrants] = useState<Grants>(() => new Map(initial));
  const [error, setError] = useState<TranslationKey | null>(null);
  // You can only give — or take away — card × actions you hold yourself (super admin: all).
  const { access } = useAccess();
  const held = (cardId: number, action: Action) =>
    !!access?.superAdmin || !!access?.grants.includes(`${cardId}:${action}`);
  const highestHeld = (card: PermissionCard) =>
    [...card.actions].reverse().find((a) => held(card.id, a)) ?? null;
  // Only cards you hold something on are listed; the rest stay as they are on the role.
  const visibleCards = permissions.filter((p) =>
    p.actions.some((a) => held(p.id, a)),
  );

  const setCard = (id: number, actions: Action[]) =>
    setGrants((prev) => {
      const next = new Map(prev);
      if (actions.length) next.set(id, sortActions(actions));
      else next.delete(id);
      return next;
    });
  // Ticking a card gives every level you can give; unticking removes them all.
  const toggleCard = (card: PermissionCard) =>
    setCard(
      card.id,
      grants.has(card.id) ? [] : actionsUpTo(highestHeld(card), card.actions),
    );
  // Actions are levels (view < create < edit < delete): picking one also grants the lower
  // levels the card offers; unticking the top level steps down to the next one.
  const toggleAction = (card: PermissionCard, action: Action) => {
    const top = topAction(grants.get(card.id) ?? []);
    const below = card.actions.filter(
      (a) => ACTIONS.indexOf(a) < ACTIONS.indexOf(action),
    );
    const level = action === top ? (below.at(-1) ?? null) : action;
    setCard(card.id, actionsUpTo(level, card.actions));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("validation.required");
    // Send only what changed: new grants to add, missing ones to remove.
    const diff = (from: Grants, to: Grants) =>
      [...to]
        .map(([permissionId, actions]) => ({
          permissionId,
          actions: actions.filter(
            (a) => !(from.get(permissionId) ?? []).includes(a),
          ),
        }))
        .filter((c) => c.actions.length > 0);
    try {
      await saveRole(
        role
          ? {
              id: role.id,
              name: name.trim(),
              add: diff(initial, grants),
              remove: diff(grants, initial),
            }
          : { name: name.trim(), grants: diff(new Map(), grants) },
      ).unwrap();
      toast.success(t(role ? "roles.updated" : "roles.created"));
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
              {t(role ? "roles.editTitle" : "roles.newTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("roles.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="roleName">{t("roles.name")}</Label>
            <Input
              id="roleName"
              autoFocus
              maxLength={50}
              placeholder={t("roles.namePlaceholder")}
              value={name}
              disabled={!!role?.is_system}
              onChange={(e) => setName(e.target.value)}
            />
            {role?.is_system && (
              <p className="text-xs text-muted-foreground">
                {t("roles.nameLocked")}
              </p>
            )}
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("roles.permissionCards")}</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("roles.grantHint")}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {t("roles.selectedCount", { count: grants.size })}
              </span>
            </div>
            {visibleCards.length === 0 ? (
              <Alert>
                <AlertDescription>
                  {t("roles.noPermissions")}{" "}
                  <Link
                    href="/permissions"
                    className="font-medium underline underline-offset-4"
                  >
                    {t("menu.permissions")}
                  </Link>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        {t("roles.card")}
                      </th>
                      {ACTIONS.map((a) => (
                        <th
                          key={a}
                          className="w-16 px-1 py-2 text-center font-medium"
                        >
                          {t(`actions.${a}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orderAsTree(visibleCards).map(({ card: p, depth }) => {
                      const granted = grants.get(p.id) ?? [];
                      return (
                        <tr
                          key={p.id}
                          className={cn(granted.length > 0 && "bg-primary/5")}
                        >
                          <td className="px-3 py-2">
                            <label
                              className="flex cursor-pointer items-center gap-3"
                              // child cards are indented under their parent
                              style={{ paddingLeft: depth * 20 }}
                            >
                              {depth > 0 && (
                                <CornerDownRight className="-mr-1 size-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <Checkbox
                                checked={granted.length > 0}
                                indeterminate={
                                  granted.length > 0 &&
                                  granted.length < p.actions.length
                                }
                                // you must hold the levels you'd add or remove
                                disabled={
                                  granted.length > 0
                                    ? !held(p.id, topAction(granted)!)
                                    : !highestHeld(p)
                                }
                                onCheckedChange={() => toggleCard(p)}
                                className="mt-0.5"
                              />
                              <span className="font-medium">{p.name}</span>
                            </label>
                          </td>
                          {ACTIONS.map((a) => {
                            const offered = p.actions.includes(a);
                            // lower levels are included by the chosen one, so they're locked on
                            const implied =
                              granted.includes(a) && a !== topAction(granted);
                            // changing this level means adding/removing it — only if you hold it
                            return (
                              <td key={a} className="px-1 text-center">
                                {/* actions you don't hold aren't shown at all (the role keeps them) */}
                                {offered && !held(p.id, a) ? null : offered ? (
                                  <Checkbox
                                    checked={granted.includes(a)}
                                    disabled={implied}
                                    title={
                                      implied
                                        ? t("roles.impliedLevel")
                                        : undefined
                                    }
                                    onCheckedChange={() => toggleAction(p, a)}
                                    aria-label={`${p.name} — ${t(`actions.${a}`)}`}
                                  />
                                ) : (
                                  <span
                                    className="text-muted-foreground/40"
                                    title={t("roles.actionNotOffered")}
                                  >
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="animate-spin" />}
              {t(role ? "common.save" : "common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleCard({
  role,
  permissionName,
  onEdit,
  onDelete,
}: {
  role: RoleItem;
  permissionName: Map<number, string>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { me, can, isSuperAdmin } = useAccess();
  const [setStatus] = useSetRoleStatusMutation();
  const isSuper = role.key === "super_admin";
  // your own role is read-only for you (the API refuses changes too) — super admins excepted
  const ownRole = !isSuperAdmin && role.id === me?.role_id;

  return (
    <Card
      className={cn(
        "flex flex-col",
        isSuper && "border-primary/40",
        !role.is_active && "opacity-70",
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isSuper ? (
            <Crown className="size-4 text-amber-500" />
          ) : (
            <ShieldCheck className="size-4 text-muted-foreground" />
          )}
          {roleName(t, role)}
          {ownRole && (
            <Badge variant="outline" className="ml-auto">
              {t("roles.yourRole")}
            </Badge>
          )}
          {role.is_system && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <Lock className="size-3" /> {t("roles.systemBadge")}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid flex-1 content-start gap-3">
        {/* Super Admin is always active; others can be switched off (it then grants nothing). */}
        {!isSuper && (
          <StatusSwitch
            active={role.is_active}
            onChange={(isActive) =>
              setStatus({ id: role.id, isActive }).unwrap()
            }
            disabledReason={
              !can("roles.updateStatus")
                ? t("status.noPermission")
                : !isSuperAdmin && role.id === me?.role_id
                  ? t("errors.CANNOT_MODIFY_OWN_ROLE")
                  : null
            }
          />
        )}
        {isSuper ? (
          <div className="grid gap-2">
            <Badge className="w-fit">{t("roles.builtIn")}</Badge>
            <p className="text-xs text-muted-foreground">
              {t("roles.allCards")} ({role.grants.length})
            </p>
          </div>
        ) : (
          <ul className="grid gap-1.5">
            {role.grants.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                {t("roles.noAccess")}
              </li>
            ) : (
              role.grants.map((g) => (
                <li
                  key={g.permission_id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-sm">
                    {permissionName.get(g.permission_id) ??
                      `#${g.permission_id}`}
                  </span>
                  <ActionBadges
                    actions={g.actions}
                    className="shrink-0 justify-end"
                  />
                </li>
              ))
            )}
          </ul>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />{" "}
          {t("roles.userCount", { count: role.user_count })}
        </p>
      </CardContent>
      {/* Super Admin is fully locked; the built-in Manager role can be edited but not deleted. */}
      {!isSuper && ownRole && (
        <CardFooter>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" /> {t("roles.ownRoleLocked")}
          </p>
        </CardFooter>
      )}
      {!isSuper &&
        !ownRole &&
        (can("roles.update") || (!role.is_system && can("roles.delete"))) && (
          <CardFooter className="justify-end gap-2">
            {!role.is_system && can("roles.delete") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={role.user_count > 0}
                title={
                  role.user_count > 0 ? t("errors.ROLE_IN_USE") : undefined
                }
              >
                <Trash2 /> {t("common.delete")}
              </Button>
            )}
            {can("roles.update") && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil /> {t("common.edit")}
              </Button>
            )}
          </CardFooter>
        )}
    </Card>
  );
}

export default function RolesPage() {
  const t = useT();
  const { data: roles, isLoading } = useRolesQuery();
  const { data: permissions = [] } = usePermissionsQuery();
  const [deleteRole, { isLoading: deleting }] = useDeleteRoleMutation();
  // `editing` undefined = closed, null = new role
  const [editing, setEditing] = useState<RoleItem | null | undefined>(
    undefined,
  );
  const [toDelete, setToDelete] = useState<RoleItem | null>(null);
  const permissionName = new Map(permissions.map((p) => [p.id, p.name]));
  const canCreate = useAccess().can("roles.create");

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteRole(toDelete.id).unwrap();
      toast.success(t("roles.deleted"));
      setToDelete(null);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        title={t("roles.title")}
        description={t("roles.pageDescription")}
      >
        {canCreate && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> {t("roles.new")}
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        {roles?.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            permissionName={permissionName}
            onEdit={() => setEditing(role)}
            onDelete={() => setToDelete(role)}
          />
        ))}
      </div>

      {editing !== undefined && (
        <RoleDialog
          key={editing?.id ?? "new"}
          role={editing}
          permissions={permissions}
          onClose={() => setEditing(undefined)}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t("roles.deleteTitle", {
          name: toDelete ? roleName(t, toDelete) : "",
        })}
        description={t("roles.deleteDescription")}
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
