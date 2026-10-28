"use client";

import { Fragment, useState } from "react";
import {
  ChevronRight,
  Eye,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Hourglass,
  MonitorSmartphone,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  UsersRound,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
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
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DeviceDialog, osLabel } from "@/components/app/device-dialog";
import { PayLinkDialog } from "@/components/app/pay-link";
import {
  NewOrderDialog,
  OrderDialog,
  StatusDialog,
  useOrderActions,
} from "@/components/app/order-dialogs";
import { PageHeader } from "@/components/app/page-header";
import {
  ScopeBar,
  ScopeFields,
  useScope,
  type Scope,
} from "@/components/app/scope";
import {
  PhoneInput,
  phoneInvalid,
  phonePayload,
  phoneValue,
} from "@/components/app/phone-input";
import { OrderStatusCell, PaymentBadge } from "@/components/app/order-status";
import { StatusSwitch } from "@/components/app/status-switch";
import { ToneBadge } from "@/components/app/tone-badge";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { billingLabel } from "@/lib/billing-label";
import { formatMoney } from "@/lib/commerce";
import { formatDateTime, intlLocale } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import {
  useAppUsersQuery,
  useDeleteAppUserMutation,
  useDeleteDeviceMutation,
  useDeleteOrderMutation,
  useDevicesQuery,
  useSetDeviceStatusMutation,
  useOrdersQuery,
  useSaveAppUserMutation,
  useSetAppUserMaxDevicesMutation,
  useSetAppUserMaxPendingOrdersMutation,
  useSetAppUserStatusMutation,
} from "@/store/api";
import type { AppUser, Device, Order, OrderDetail } from "@/store/types";
import { Pager, usePage } from "@/components/app/pager";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const limitValid = (v: string, max: number) =>
  /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= max;
const maxDevicesValid = (v: string) => limitValid(v, 1000);
const maxPendingValid = (v: string) => limitValid(v, 100);

function UserDialog({
  user,
  scope,
  onClose,
}: {
  user: AppUser | null;
  scope: Scope;
  onClose: () => void;
}) {
  const t = useT();
  const [save, { isLoading }] = useSaveAppUserMutation();
  const [appId, setAppId] = useState(user?.app_id ?? scope.appId);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: phoneValue(user?.phone, user?.phone_country),
    maxDevices: String(user?.max_devices ?? 1),
    maxPendingOrders: String(user?.max_pending_orders ?? 3),
  });
  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));
  const emailInvalid = !!form.email.trim() && !EMAIL_RE.test(form.email.trim());
  // reachable: an email, a phone, or both
  const noContact = !form.email.trim() && !form.phone.number.trim();
  const valid =
    !!form.name.trim() &&
    !emailInvalid &&
    !phoneInvalid(form.phone) &&
    !noContact &&
    (!!user ||
      (maxDevicesValid(form.maxDevices) &&
        maxPendingValid(form.maxPendingOrders))) &&
    !!appId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      const fields = {
        name: form.name,
        email: form.email,
        phone: phonePayload(form.phone),
      };
      // limits: set when creating, changed later with their own actions
      const res = await save(
        user
          ? { id: user.id, ...fields }
          : {
              appId,
              ...fields,
              maxDevices: Number(form.maxDevices),
              maxPendingOrders: Number(form.maxPendingOrders),
            },
      ).unwrap();
      toast.success(res.message);
      onClose();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {t(user ? "appUsers.editTitle" : "appUsers.newTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("appUsers.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {user ? (
            <ScopeFields appName={user.app_name} />
          ) : (
            <ScopeFields appId={appId} onApp={setAppId} />
          )}
          <div className="grid gap-2">
            <Label htmlFor="userName">{t("appUsers.name")}</Label>
            <Input
              id="userName"
              maxLength={120}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="userEmail">{t("appUsers.email")}</Label>
            <Input
              id="userEmail"
              type="email"
              maxLength={255}
              aria-invalid={emailInvalid}
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
            {emailInvalid && (
              <p className="text-xs text-destructive">
                {t("validation.emailInvalid")}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="userPhone">{t("appUsers.phone")}</Label>
            <PhoneInput
              id="userPhone"
              value={form.phone}
              onChange={(phone) => set({ phone })}
            />
            <p className="text-xs text-muted-foreground">
              {t("appUsers.contactHint")}
            </p>
          </div>
          {!user && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="userMaxDevices">{t("appUsers.maxDevices")}</Label>
                <Input
                  id="userMaxDevices"
                  type="number"
                  min={1}
                  max={1000}
                  className="w-32"
                  aria-invalid={!maxDevicesValid(form.maxDevices)}
                  value={form.maxDevices}
                  onChange={(e) => set({ maxDevices: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t("appUsers.maxDevicesHint")}
                </p>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="userMaxPending">{t("appUsers.maxPendingOrders")}</Label>
                <Input
                  id="userMaxPending"
                  type="number"
                  min={1}
                  max={100}
                  className="w-32"
                  aria-invalid={!maxPendingValid(form.maxPendingOrders)}
                  value={form.maxPendingOrders}
                  onChange={(e) => set({ maxPendingOrders: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t("appUsers.maxPendingOrdersHint")}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !valid}>
              {isLoading && <Loader2 className="animate-spin" />}
              {t(user ? "common.save" : "common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A user's limits, each changed with its own action and permission. */
const LIMITS = {
  devices: {
    field: "max_devices",
    inUse: "device_count",
    max: 1000,
    title: "appUsers.maxDevicesTitle",
    label: "appUsers.maxDevices",
    hint: "appUsers.maxDevicesHint",
    inUseText: "appUsers.maxDevicesInUse",
  },
  pendingOrders: {
    field: "max_pending_orders",
    inUse: "pending_order_count",
    max: 100,
    title: "appUsers.maxPendingOrdersTitle",
    label: "appUsers.maxPendingOrders",
    hint: "appUsers.maxPendingOrdersHint",
    inUseText: "appUsers.maxPendingOrdersInUse",
  },
} as const satisfies Record<
  string,
  {
    field: keyof AppUser;
    inUse: keyof AppUser;
    max: number;
    title: TranslationKey;
    label: TranslationKey;
    hint: TranslationKey;
    inUseText: TranslationKey;
  }
>;
type LimitKind = keyof typeof LIMITS;

/** Changes one of a user's limits: allowed devices or pending orders. */
function LimitDialog({
  user,
  kind,
  onClose,
}: {
  user: AppUser;
  kind: LimitKind;
  onClose: () => void;
}) {
  const t = useT();
  const limit = LIMITS[kind];
  const [saveDevices, { isLoading: savingDevices }] =
    useSetAppUserMaxDevicesMutation();
  const [savePending, { isLoading: savingPending }] =
    useSetAppUserMaxPendingOrdersMutation();
  const current = user[limit.field];
  const [value, setValue] = useState(String(current));
  const valid = limitValid(value, limit.max) && Number(value) !== current;
  const isLoading = savingDevices || savingPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      const res =
        kind === "devices"
          ? await saveDevices({ id: user.id, maxDevices: Number(value) }).unwrap()
          : await savePending({
              id: user.id,
              maxPendingOrders: Number(value),
            }).unwrap();
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
            <DialogTitle>{t(limit.title, { name: user.name })}</DialogTitle>
            <DialogDescription>{t(limit.hint)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="changeLimit">{t(limit.label)}</Label>
            <Input
              id="changeLimit"
              type="number"
              min={1}
              max={limit.max}
              autoFocus
              className="w-32"
              aria-invalid={!limitValid(value, limit.max)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t(limit.inUseText, { count: user[limit.inUse] })}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !valid}>
              {isLoading && <Loader2 className="animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A titled block under a user row that opens and closes on its own; `action` sits on the right. */
function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-fit items-center gap-1.5 text-sm font-medium"
        >
          <ChevronRight
            className={cn("size-4 transition-transform", open && "rotate-90")}
          />
          {title}
          <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground tabular-nums">
            {count}
          </span>
        </button>
        {action}
      </div>
      {open && <div className="pl-5">{children}</div>}
    </section>
  );
}

/** A user's devices with the Devices page's actions (same permissions). */
function UserDevices({ user }: { user: AppUser }) {
  const t = useT();
  const { locale } = useLocale();
  const { can } = useAccess();
  const [page, setPage] = usePage("");
  const { data, isLoading, isFetching } = useDevicesQuery({ appUserId: user.id, page });
  const devices = data?.items;
  const [setStatus] = useSetDeviceStatusMutation();
  const [remove, { isLoading: deleting }] = useDeleteDeviceMutation();
  // undefined = closed, null = new device for this user
  const [editing, setEditing] = useState<Device | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Device | null>(null);
  const canEdit = can("devices.update");
  const canDelete = can("devices.delete");
  const canStatus = can("devices.updateStatus");

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove({ id: toDelete.id }).unwrap();
      toast.success(t("devices.deleted"));
      setToDelete(null);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Section
      title={t("appUsers.devices")}
      count={user.device_count}
      action={
        can("devices.create") && (
          <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
            <Plus /> {t("devices.new")}
          </Button>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-10" />
      ) : !devices?.length ? (
        <p className="py-1 text-sm text-muted-foreground">
          {t("appUsers.noDevices")}
        </p>
      ) : (
        <ul className="grid gap-1">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-background px-3 py-2 text-sm"
            >
              <Badge variant="secondary">{t(osLabel(d.os))}</Badge>
              <code className="text-xs">{d.device_uid}</code>
              {d.model && (
                <span className="text-muted-foreground">{d.model}</span>
              )}
              {d.fingerprint && (
                <span
                  className="max-w-64 truncate font-mono text-xs text-muted-foreground"
                  title={d.fingerprint}
                >
                  {d.fingerprint}
                </span>
              )}
              <span className="ml-auto flex items-center gap-3">
                <StatusSwitch
                  active={d.is_active}
                  onChange={(isActive) =>
                    setStatus({ id: d.id, isActive }).unwrap()
                  }
                  disabledReason={canStatus ? null : t("status.noPermission")}
                />
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {formatDateTime(d.created_at, locale, "—")}
                </span>
                {(canEdit || canDelete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={t("common.actions")}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onClick={() => setEditing(d)}>
                          <Pencil /> {t("common.edit")}
                        </DropdownMenuItem>
                      )}
                      {canEdit && canDelete && <DropdownMenuSeparator />}
                      {canDelete && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setToDelete(d)}
                        >
                          <Trash2 /> {t("common.delete")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={!!data?.hasMore} onChange={setPage} busy={isFetching} />
      {editing !== undefined && (
        <DeviceDialog
          key={editing?.id ?? "new"}
          device={editing}
          defaults={{
            appId: user.app_id,
            appName: user.app_name,
            appUserId: user.id,
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t("devices.deleteTitle", { name: toDelete?.device_uid ?? "" })}
        description={t("devices.deleteDescription")}
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </Section>
  );
}

/** A user's orders with the Orders page's actions (same permissions). */
function UserOrders({ user }: { user: AppUser }) {
  const t = useT();
  const { locale } = useLocale();
  const { can } = useAccess();
  const [page, setPage] = usePage("");
  const { data, isLoading, isFetching } = useOrdersQuery({ appUserId: user.id, page });
  const orders = data?.items;
  const [remove, { isLoading: deleting }] = useDeleteOrderMutation();
  const { canChangeStatus, renewable, runRenew, hasPayLink } =
    useOrderActions();
  const [payLink, setPayLink] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [changing, setChanging] = useState<Order | OrderDetail | null>(null);
  const [toDelete, setToDelete] = useState<Order | null>(null);
  const canView = can("orders.get");
  // orders that were ever paid stay as a record
  const deletable = (o: Order) => can("orders.delete") && !o.paid_at;

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove({ id: toDelete.id }).unwrap();
      toast.success(t("orders.deleted"));
      setToDelete(null);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Section
      title={t("menu.orders")}
      count={user.order_count}
      action={
        can("orders.create") && (
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus /> {t("orders.new")}
          </Button>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-10" />
      ) : !orders?.length ? (
        <p className="py-1 text-sm text-muted-foreground">
          {t("appUsers.noOrders")}
        </p>
      ) : (
        <ul className="grid gap-1">
          {orders.map((o) => (
            <li
              key={o.id}
              className="grid items-center gap-x-4 gap-y-1 rounded-md bg-background px-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto_auto_auto]"
            >
              <div className="grid min-w-0">
                <span className="font-mono text-xs">{o.order_number}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {billingLabel(t, o)} ·{" "}
                  {formatDateTime(o.created_at, locale, "—")}
                </span>
              </div>
              <span className="font-medium tabular-nums">
                {formatMoney(o.total, o.currency, intlLocale[locale])}
              </span>
              <PaymentBadge status={o.payment_status} />
              <OrderStatusCell order={o} />
              {canView ||
              canChangeStatus ||
              hasPayLink(o) ||
              renewable(o) ||
              deletable(o) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t("common.actions")}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canView && (
                      <DropdownMenuItem onClick={() => setViewing(o.id)}>
                        <Eye /> {t("orders.view")}
                      </DropdownMenuItem>
                    )}
                    {canChangeStatus && (
                      <DropdownMenuItem onClick={() => setChanging(o)}>
                        <ListChecks /> {t("orders.changeStatus")}
                      </DropdownMenuItem>
                    )}
                    {hasPayLink(o) && (
                      <DropdownMenuItem onClick={() => setPayLink(o)}>
                        <Link2 /> {t("orders.payLink")}
                      </DropdownMenuItem>
                    )}
                    {renewable(o) && (
                      <DropdownMenuItem onClick={() => runRenew(o.id)}>
                        <RotateCw /> {t("orders.renew")}
                      </DropdownMenuItem>
                    )}
                    {deletable(o) && (
                      <>
                        {(canView ||
                          canChangeStatus ||
                          hasPayLink(o) ||
                          renewable(o)) && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setToDelete(o)}
                        >
                          <Trash2 /> {t("common.delete")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="w-7" />
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasMore={!!data?.hasMore} onChange={setPage} busy={isFetching} />
      {creating && (
        <NewOrderDialog
          defaults={{
            appId: user.app_id,
            appName: user.app_name,
            userId: user.id,
            userName: user.name,
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {viewing !== null && (
        <OrderDialog
          id={viewing}
          onClose={() => setViewing(null)}
          onChangeStatus={(o) => {
            setViewing(null);
            setChanging(o);
          }}
        />
      )}
      {changing && (
        <StatusDialog
          key={changing.id}
          order={changing}
          onClose={() => setChanging(null)}
        />
      )}
      {payLink && (
        <PayLinkDialog order={payLink} onClose={() => setPayLink(null)} />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t("orders.deleteTitle", { name: toDelete?.order_number ?? "" })}
        description={t("orders.deleteDescription")}
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </Section>
  );
}

/** Under an expanded user row: their devices and orders, each a collapsible section with its actions. */
function UserDetails({ user }: { user: AppUser }) {
  const { can } = useAccess();
  return (
    <div className="grid gap-4">
      {can("devices.list") && <UserDevices user={user} />}
      {can("orders.list") && <UserOrders user={user} />}
    </div>
  );
}

export default function AppUsersPage() {
  const t = useT();
  const { locale } = useLocale();
  const { can } = useAccess();
  const scope = useScope();
  const [search, setSearch] = useState("");
  const [page, setPage] = usePage(JSON.stringify([scope.appId, search.trim()]));
  const { data, isLoading, isFetching } = useAppUsersQuery(
    { appId: scope.appId, search: search.trim() || undefined, page },
    { skip: !scope.platformId },
  );
  const users = data?.items;
  const [remove, { isLoading: deleting }] = useDeleteAppUserMutation();
  const [editing, setEditing] = useState<AppUser | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<AppUser | null>(null);
  const canEdit = can("users.update");
  const canDelete = can("users.delete");
  const canStatus = can("users.updateStatus");
  const canMaxDevices = can("users.updateMaxDevices");
  const canMaxPending = can("users.updateMaxPendingOrders");
  const canLimits = canMaxDevices || canMaxPending;
  const [limiting, setLimiting] = useState<{
    user: AppUser;
    kind: LimitKind;
  } | null>(null);
  const [setStatus] = useSetAppUserStatusMutation();
  // the row opens to show the user's devices and orders (whichever the role can see)
  const canExpand = can("devices.list") || can("orders.list");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove({ id: toDelete.id }).unwrap();
      toast.success(t("appUsers.deleted"));
      setToDelete(null);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("appUsers.title")}
        description={t("appUsers.pageDescription")}
      >
        {can("users.create") && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> {t("appUsers.new")}
          </Button>
        )}
      </PageHeader>

      <ScopeBar scope={scope}>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("appUsers.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </ScopeBar>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("appUsers.name")}</TableHead>
                <TableHead>{t("scope.app")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("appUsers.phone")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("appUsers.devices")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("appUsers.maxDevices")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("menu.orders")}
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("appUsers.pendingOrders")}
                </TableHead>
                <TableHead>{t("status.title")}</TableHead>
                <TableHead className="hidden lg:table-cell">
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
                  <TableCell colSpan={10}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {users?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center">
                    <UsersRound className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-medium">{t("appUsers.emptyTitle")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("appUsers.emptyText")}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {users?.map((u) => (
                <Fragment key={u.id}>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {canExpand && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-expanded={expanded.has(u.id)}
                            aria-label={t("appUsers.showDetails")}
                            onClick={() => toggle(u.id)}
                          >
                            <ChevronRight
                              className={cn(
                                "transition-transform",
                                expanded.has(u.id) && "rotate-90",
                              )}
                            />
                          </Button>
                        )}
                        <div className="grid">
                          <span className="font-medium">{u.name}</span>
                          {u.email && (
                            <span className="text-xs text-muted-foreground">
                              {u.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{u.app_name}</TableCell>
                    <TableCell className="hidden text-sm whitespace-nowrap tabular-nums lg:table-cell">
                      {u.phone ? formatPhone(u.phone) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {u.device_count > u.max_devices ? (
                        <ToneBadge tone="amber">
                          {u.device_count} · {t("appUsers.overLimit")}
                        </ToneBadge>
                      ) : (
                        u.device_count
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {u.max_devices}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {u.order_count}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {u.pending_order_count >= u.max_pending_orders ? (
                        <ToneBadge tone="amber">
                          {u.pending_order_count} / {u.max_pending_orders}
                        </ToneBadge>
                      ) : (
                        `${u.pending_order_count} / ${u.max_pending_orders}`
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusSwitch
                        active={u.is_active}
                        onChange={(isActive) =>
                          setStatus({ id: u.id, isActive }).unwrap()
                        }
                        disabledReason={
                          canStatus ? null : t("status.noPermission")
                        }
                      />
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {formatDateTime(u.created_at, locale, "—")}
                    </TableCell>
                    <TableCell>
                      {(canEdit || canLimits || canDelete) && (
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
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setEditing(u)}>
                                <Pencil /> {t("common.edit")}
                              </DropdownMenuItem>
                            )}
                            {canMaxDevices && (
                              <DropdownMenuItem
                                onClick={() => setLimiting({ user: u, kind: "devices" })}
                              >
                                <MonitorSmartphone />{" "}
                                {t("appUsers.changeMaxDevices")}
                              </DropdownMenuItem>
                            )}
                            {canMaxPending && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setLimiting({ user: u, kind: "pendingOrders" })
                                }
                              >
                                <Hourglass /> {t("appUsers.maxPendingOrders")}
                              </DropdownMenuItem>
                            )}
                            {(canEdit || canLimits) && canDelete && (
                              <DropdownMenuSeparator />
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setToDelete(u)}
                              >
                                <Trash2 /> {t("common.delete")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded.has(u.id) && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={10} className="px-4 py-3">
                        <UserDetails user={u} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Pager page={page} hasMore={!!data?.hasMore} onChange={setPage} busy={isFetching} />

      {editing !== undefined && (
        <UserDialog
          key={editing?.id ?? "new"}
          user={editing}
          scope={scope}
          onClose={() => setEditing(undefined)}
        />
      )}
      {limiting && (
        <LimitDialog
          key={`${limiting.kind}-${limiting.user.id}`}
          user={limiting.user}
          kind={limiting.kind}
          onClose={() => setLimiting(null)}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t("appUsers.deleteTitle", { name: toDelete?.name ?? "" })}
        description={t("appUsers.deleteDescription")}
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
