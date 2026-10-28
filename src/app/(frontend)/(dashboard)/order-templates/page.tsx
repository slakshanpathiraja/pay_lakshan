"use client";

import { useState } from "react";
import { LayoutTemplate, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { BillingPeriodFields, useBillingPeriod } from "@/components/app/order-dialogs";
import { PageHeader } from "@/components/app/page-header";
import { ScopeBar, ScopeFields, useScope, type Scope } from "@/components/app/scope";
import { StatusSwitch } from "@/components/app/status-switch";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import { billingLabel } from "@/lib/billing-label";
import { CURRENCIES, currencyDigits, formatMoney, toMinor, type Currency } from "@/lib/commerce";
import { formatDateTime, intlLocale } from "@/lib/format";
import {
  useDeleteOrderTemplateMutation,
  useOrderTemplatesQuery,
  useSaveOrderTemplateMutation,
  useSetOrderTemplateStatusMutation,
} from "@/store/api";
import type { OrderTemplate } from "@/store/types";
import { Pager, usePage } from "@/components/app/pager";

const CODE_RE = /^[a-z0-9][a-z0-9._-]{0,59}$/;
/** "Pro plan (monthly)" → "pro_plan_monthly" */
const codeFrom = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
const minorToText = (minor: number, currency: string) => (minor / 10 ** currencyDigits(currency)).toFixed(currencyDigits(currency));

/** New / edit template: item, price, billing, the code apps order it by, an optional Play product. */
function TemplateDialog({
  template,
  scope,
  onClose,
}: {
  template: OrderTemplate | null;
  scope: Scope;
  onClose: () => void;
}) {
  const t = useT();
  const [save, { isLoading }] = useSaveOrderTemplateMutation();
  const [appId, setAppId] = useState(template?.app_id ?? scope.appId);
  const [name, setName] = useState(template?.name ?? "");
  const [code, setCode] = useState(template?.code ?? "");
  // the code follows the name until it's typed in
  const [codeTouched, setCodeTouched] = useState(!!template);
  const [currency, setCurrency] = useState<Currency>(template?.currency ?? "USD");
  const [price, setPrice] = useState(template ? minorToText(template.unit_amount, template.currency) : "");
  const [googleProductId, setGoogleProductId] = useState(template?.google_product_id ?? "");
  const billingPeriod = useBillingPeriod(
    template ? { billing: template.billing, unit: template.interval_unit, count: template.interval_count } : undefined,
  );
  const { billing, period, periodValid } = billingPeriod;
  const amount = toMinor(price, currency);
  const codeValue = codeTouched ? code : codeFrom(name);
  const valid = !!appId && !!name.trim() && CODE_RE.test(codeValue) && amount !== null && periodValid;
  const currencyItems = CURRENCIES.map((c) => ({ value: c, label: c }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const base = { name: name.trim(), code: codeValue, currency, unitAmount: amount!, googleProductId };
    try {
      const res = await save({
        id: template?.id,
        appId,
        ...(billing === "lifetime"
          ? { ...base, billing }
          : { ...base, billing, intervalUnit: period.unit, intervalCount: period.count }),
      }).unwrap();
      toast.success(res.message);
      onClose();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form noValidate onSubmit={submit} className="grid min-w-0 gap-4">
          <DialogHeader>
            <DialogTitle>{t(template ? "templates.editTitle" : "templates.newTitle")}</DialogTitle>
            <DialogDescription>{t("templates.pageDescription")}</DialogDescription>
          </DialogHeader>
          {template ? <ScopeFields appName={template.app_name} /> : <ScopeFields appId={appId} onApp={setAppId} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="tplName">{t("templates.name")}</Label>
              <Input
                id="tplName"
                maxLength={160}
                placeholder={t("templates.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="tplCode">{t("templates.code")}</Label>
              <Input
                id="tplCode"
                className="font-mono text-sm"
                maxLength={60}
                aria-invalid={!!codeValue && !CODE_RE.test(codeValue)}
                value={codeValue}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(e.target.value.toLowerCase());
                }}
              />
              <p className="text-xs text-muted-foreground">{t("templates.codeHint")}</p>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tplPrice">{t("templates.price")}</Label>
            <div className="flex gap-2">
              <Input
                id="tplPrice"
                inputMode="decimal"
                placeholder="9.99"
                className="w-40"
                aria-invalid={!!price && amount === null}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <div className="w-28">
                <Select items={currencyItems} value={currency} onValueChange={(v) => v && setCurrency(v as Currency)}>
                  <SelectTrigger className="w-full" aria-label={t("orders.currency")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyItems.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <BillingPeriodFields state={billingPeriod} />
          <div className="grid gap-2">
            <Label htmlFor="tplGoogle">{t("templates.googleProduct")}</Label>
            <Input
              id="tplGoogle"
              className="font-mono text-sm"
              maxLength={150}
              placeholder="pro_monthly"
              value={googleProductId}
              onChange={(e) => setGoogleProductId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("templates.googleProductHint")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !valid}>
              {isLoading && <Loader2 className="animate-spin" />}
              {t(template ? "common.save" : "common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** An app's ready-made orders: list, add, edit, turn on / off, delete. */
export default function OrderTemplatesPage() {
  const t = useT();
  const { locale } = useLocale();
  const { can } = useAccess();
  const scope = useScope();
  const [page, setPage] = usePage(String(scope.appId ?? ""));
  const { data, isLoading, isFetching } = useOrderTemplatesQuery(
    { appId: scope.appId, page },
    { skip: !scope.platformId },
  );
  const templates = data?.items;
  const [remove, { isLoading: deleting }] = useDeleteOrderTemplateMutation();
  const [setStatus] = useSetOrderTemplateStatusMutation();
  const [editing, setEditing] = useState<OrderTemplate | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<OrderTemplate | null>(null);
  const canEdit = can("orderTemplates.update");
  const canDelete = can("orderTemplates.delete");
  const canStatus = can("orderTemplates.updateStatus");

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await remove({ id: toDelete.id }).unwrap();
      toast.success(t("templates.deleted"));
      setToDelete(null);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("templates.title")} description={t("templates.pageDescription")}>
        {can("orderTemplates.create") && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> {t("templates.new")}
          </Button>
        )}
      </PageHeader>

      <ScopeBar scope={scope} />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("templates.name")}</TableHead>
                <TableHead>{t("scope.app")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("orders.type")}</TableHead>
                <TableHead className="text-right">{t("templates.price")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("templates.googleProduct")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{t("templates.orders")}</TableHead>
                <TableHead>{t("status.title")}</TableHead>
                <TableHead className="hidden xl:table-cell">{t("apps.added")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("common.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {templates?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <LayoutTemplate className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-medium">{t("templates.emptyTitle")}</p>
                    <p className="text-sm text-muted-foreground">{t("templates.emptyText")}</p>
                  </TableCell>
                </TableRow>
              )}
              {templates?.map((tp) => (
                <TableRow key={tp.id}>
                  <TableCell>
                    <div className="grid">
                      <span className="font-medium">{tp.name}</span>
                      <code className="text-xs text-muted-foreground">{tp.code}</code>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{tp.app_name}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{billingLabel(t, tp)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(tp.unit_amount, tp.currency, intlLocale[locale])}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell">{tp.google_product_id ?? "—"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{tp.order_count}</TableCell>
                  <TableCell>
                    <StatusSwitch
                      active={tp.is_active}
                      onChange={(isActive) => setStatus({ id: tp.id, isActive }).unwrap()}
                      disabledReason={canStatus ? null : t("status.noPermission")}
                    />
                  </TableCell>
                  <TableCell className="hidden text-sm xl:table-cell">
                    {formatDateTime(tp.created_at, locale, "—")}
                  </TableCell>
                  <TableCell>
                    {(canEdit || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" aria-label={t("common.actions")} />}
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit && (
                            <DropdownMenuItem onClick={() => setEditing(tp)}>
                              <Pencil /> {t("common.edit")}
                            </DropdownMenuItem>
                          )}
                          {canEdit && canDelete && <DropdownMenuSeparator />}
                          {canDelete && (
                            <DropdownMenuItem variant="destructive" onClick={() => setToDelete(tp)}>
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
      <Pager page={page} hasMore={!!data?.hasMore} onChange={setPage} busy={isFetching} />

      {editing !== undefined && (
        <TemplateDialog
          key={editing?.id ?? "new"}
          template={editing}
          scope={scope}
          onClose={() => setEditing(undefined)}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t("templates.deleteTitle", { name: toDelete?.name ?? "" })}
        description={t("templates.deleteDescription")}
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
