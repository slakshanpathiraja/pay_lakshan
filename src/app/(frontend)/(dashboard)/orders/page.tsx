"use client";

import { useState } from "react";
import {
  Eye,
  ListChecks,
  MoreHorizontal,
  Plus,
  RotateCw,
  ShoppingCart,
  Trash2,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { PayLinkDialog } from "@/components/app/pay-link";
import {
  NewOrderDialog,
  OrderDialog,
  StatusDialog,
  useOrderActions,
} from "@/components/app/order-dialogs";
import { ScopeBar, useScope } from "@/components/app/scope";
import {
  OrderStatusCell,
  PaymentBadge,
  paymentLabel,
  statusLabel,
} from "@/components/app/order-status";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import { billingLabel } from "@/lib/billing-label";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  formatMoney,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/commerce";
import { formatDateTime, intlLocale } from "@/lib/format";
import { useDeleteOrderMutation, useOrdersQuery } from "@/store/api";
import type { Order, OrderDetail } from "@/store/types";
import { Pager, usePage } from "@/components/app/pager";

const ALL = "all";

export default function OrdersPage() {
  const t = useT();
  const { locale } = useLocale();
  const { can } = useAccess();
  const scope = useScope();
  const [payment, setPayment] = useState<PaymentStatus | undefined>();
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [page, setPage] = usePage(JSON.stringify([scope.appId, payment, status]));
  const { data, isLoading, isFetching } = useOrdersQuery(
    { appId: scope.appId, payment, status, page },
    { skip: !scope.platformId },
  );
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
  const paymentItems = [
    { value: ALL, label: t("orders.allPayments") },
    ...PAYMENT_STATUSES.map((s) => ({ value: s, label: t(paymentLabel(s)) })),
  ];
  const statusItems = [
    { value: ALL, label: t("orders.allStatuses") },
    ...ORDER_STATUSES.map((s) => ({ value: s, label: t(statusLabel(s)) })),
  ];

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
    <div className="grid gap-6">
      <PageHeader
        title={t("orders.title")}
        description={t("orders.pageDescription")}
      >
        {can("orders.create") && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t("orders.new")}
          </Button>
        )}
      </PageHeader>

      <ScopeBar scope={scope}>
        <div className="sm:w-44">
          <Select
            items={paymentItems}
            value={payment ?? ALL}
            onValueChange={(v) =>
              v && setPayment(v === ALL ? undefined : (v as PaymentStatus))
            }
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("orders.paymentLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {paymentItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:w-44">
          <Select
            items={statusItems}
            value={status ?? ALL}
            onValueChange={(v) =>
              v && setStatus(v === ALL ? undefined : (v as OrderStatus))
            }
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("orders.orderStatusLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ScopeBar>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orders.number")}</TableHead>
                <TableHead>{t("orders.customer")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("orders.type")}
                </TableHead>
                <TableHead className="text-right">
                  {t("orders.total")}
                </TableHead>
                <TableHead>{t("orders.paymentLabel")}</TableHead>
                <TableHead>{t("orders.orderStatusLabel")}</TableHead>
                <TableHead className="hidden xl:table-cell">
                  {t("orders.created")}
                </TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {orders?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <ShoppingCart className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-medium">{t("orders.emptyTitle")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("orders.emptyText")}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {orders?.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="grid">
                      <span className="font-mono text-xs">
                        {o.order_number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {o.app_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid">
                      <span className="font-medium">{o.user_name}</span>
                      {o.user_email && (
                        <span className="text-xs text-muted-foreground">
                          {o.user_email}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {billingLabel(t, o)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(o.total, o.currency, intlLocale[locale])}
                  </TableCell>
                  <TableCell>
                    <PaymentBadge status={o.payment_status} />
                  </TableCell>
                  <TableCell>
                    <OrderStatusCell order={o} />
                  </TableCell>
                  <TableCell className="hidden text-sm xl:table-cell">
                    {formatDateTime(o.created_at, locale, "—")}
                  </TableCell>
                  <TableCell>
                    {(canView ||
                      canChangeStatus ||
                      hasPayLink(o) ||
                      renewable(o) ||
                      deletable(o)) && (
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
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Pager page={page} hasMore={!!data?.hasMore} onChange={setPage} busy={isFetching} />

      {creating && (
        <NewOrderDialog
          defaults={{ appId: scope.appId }}
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
    </div>
  );
}
