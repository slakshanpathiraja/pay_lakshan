"use client";

import { useDeferredValue, useState } from "react";
import { CreditCard, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { PageHeader } from "@/components/app/page-header";
import {
  PaymentAmount,
  PaymentMethod,
  PaymentRecordBadge,
  ReceiptLink,
  paymentRecordLabel,
} from "@/components/app/payments";
import { ScopeBar, useScope } from "@/components/app/scope";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  PAYMENT_RECORD_STATUSES,
  type PaymentRecordStatus,
} from "@/lib/commerce";
import { formatDateTime } from "@/lib/format";
import { usePaymentsQuery } from "@/store/api";

const ALL = "all";

/** Payments Stripe reported (first payments, renewals, failures, refunds) — a read-only list. */
export default function PaymentsPage() {
  const t = useT();
  const { locale } = useLocale();
  const scope = useScope();
  const [status, setStatus] = useState<PaymentRecordStatus | undefined>();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const { data: payments, isLoading } = usePaymentsQuery(
    { appId: scope.appId, status, search: deferredSearch || undefined },
    { skip: !scope.platformId },
  );
  const statusItems = [
    { value: ALL, label: t("payments.allStatuses") },
    ...PAYMENT_RECORD_STATUSES.map((s) => ({
      value: s,
      label: t(paymentRecordLabel(s)),
    })),
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        title={t("payments.title")}
        description={t("payments.pageDescription")}
      />

      <ScopeBar scope={scope}>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("payments.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-48">
          <Select
            items={statusItems}
            value={status ?? ALL}
            onValueChange={(v) =>
              v && setStatus(v === ALL ? undefined : (v as PaymentRecordStatus))
            }
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("payments.statusLabel")}
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
                <TableHead>{t("payments.date")}</TableHead>
                <TableHead>{t("payments.order")}</TableHead>
                <TableHead>{t("payments.customer")}</TableHead>
                <TableHead>{t("payments.method")}</TableHead>
                <TableHead>{t("payments.statusLabel")}</TableHead>
                <TableHead className="text-right">
                  {t("payments.amount")}
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
              {payments?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <CreditCard className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-medium">{t("payments.emptyTitle")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("payments.emptyText")}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {payments?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    <div className="grid">
                      <span>
                        {formatDateTime(p.paid_at ?? p.created_at, locale, "—")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t(`payments.kind.${p.kind}` as TranslationKey)}
                        {!p.livemode && ` · ${t("payments.testMode")}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid">
                      <span className="font-mono text-xs">
                        {p.order_number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.app_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid">
                      <span className="font-medium">{p.user_name}</span>
                      {p.user_email && (
                        <span className="text-xs text-muted-foreground">
                          {p.user_email}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-56 text-sm">
                    <PaymentMethod payment={p} />
                  </TableCell>
                  <TableCell>
                    <div className="grid justify-items-start gap-1">
                      <PaymentRecordBadge status={p.status} />
                      {p.status === "failed" && p.failure_message && (
                        <span className="max-w-48 text-xs text-destructive">
                          {p.failure_message}
                        </span>
                      )}
                      <ReceiptLink url={p.receipt_url} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <PaymentAmount payment={p} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
