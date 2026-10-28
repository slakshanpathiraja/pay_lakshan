"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DeviceDialog, osLabel } from "@/components/app/device-dialog";
import { ScopeBar, useScope } from "@/components/app/scope";
import { StatusSwitch } from "@/components/app/status-switch";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import {
  useDeleteDeviceMutation,
  useDevicesQuery,
  useSetDeviceStatusMutation,
} from "@/store/api";
import type { Device } from "@/store/types";
import { Pager, usePage } from "@/components/app/pager";

export default function DevicesPage() {
  const t = useT();
  const { locale } = useLocale();
  const { can } = useAccess();
  const scope = useScope();
  const [page, setPage] = usePage(String(scope.appId ?? ""));
  const { data, isLoading, isFetching } = useDevicesQuery(
    { appId: scope.appId, page },
    { skip: !scope.platformId },
  );
  const devices = data?.items;
  const [remove, { isLoading: deleting }] = useDeleteDeviceMutation();
  const [editing, setEditing] = useState<Device | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Device | null>(null);
  const canEdit = can("devices.update");
  const canDelete = can("devices.delete");
  const canStatus = can("devices.updateStatus");
  const [setStatus] = useSetDeviceStatusMutation();

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
    <div className="grid gap-6">
      <PageHeader
        title={t("devices.title")}
        description={t("devices.pageDescription")}
      >
        {can("devices.create") && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> {t("devices.new")}
          </Button>
        )}
      </PageHeader>

      <ScopeBar scope={scope} />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("devices.deviceId")}</TableHead>
                <TableHead>{t("devices.osLabel")}</TableHead>
                <TableHead>{t("scope.app")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("devices.user")}
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
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              )}
              {devices?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <Smartphone className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="font-medium">{t("devices.emptyTitle")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("devices.emptyText")}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {devices?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="grid">
                      <code className="text-xs">{d.device_uid}</code>
                      {(d.model || d.fingerprint) && (
                        <span
                          className="max-w-64 truncate text-xs text-muted-foreground"
                          title={d.fingerprint ?? undefined}
                        >
                          {[
                            d.model,
                            d.fingerprint &&
                              `${t("devices.fingerprint")}: ${d.fingerprint}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(osLabel(d.os))}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{d.app_name}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {d.user_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusSwitch
                      active={d.is_active}
                      onChange={(isActive) =>
                        setStatus({ id: d.id, isActive }).unwrap()
                      }
                      disabledReason={
                        canStatus ? null : t("status.noPermission")
                      }
                    />
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {formatDateTime(d.created_at, locale, "—")}
                  </TableCell>
                  <TableCell>
                    {(canEdit || canDelete) && (
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Pager page={page} hasMore={!!data?.hasMore} onChange={setPage} busy={isFetching} />

      {editing !== undefined && (
        <DeviceDialog
          key={editing?.id ?? "new"}
          device={editing}
          defaults={{ appId: scope.appId }}
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
    </div>
  );
}
