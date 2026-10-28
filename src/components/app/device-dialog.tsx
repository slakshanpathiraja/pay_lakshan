"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { CustomerPicker } from "@/components/app/customer-picker";
import { ScopeFields } from "@/components/app/scope";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { DEVICE_OS, type DeviceOs } from "@/lib/commerce";
import { useSaveDeviceMutation } from "@/store/api";
import type { Device } from "@/store/types";

export const osLabel = (os: DeviceOs) => `devices.os.${os}` as TranslationKey;

/**
 * Add or edit a device. `defaults` pre-fills a new one (e.g. from a user's row: their app,
 * shown fixed when `appName` is given, and the user).
 */
export function DeviceDialog({
  device,
  defaults,
  onClose,
}: {
  device: Device | null;
  defaults?: { appId?: number; appName?: string; appUserId?: number };
  onClose: () => void;
}) {
  const t = useT();
  const [save, { isLoading }] = useSaveDeviceMutation();
  const [appId, setAppId] = useState(device?.app_id ?? defaults?.appId);
  const [form, setForm] = useState({
    appUserId: device?.app_user_id ?? defaults?.appUserId ?? null,
    deviceUid: device?.device_uid ?? "",
    fingerprint: device?.fingerprint ?? "",
    os: device?.os ?? ("android" as DeviceOs),
    model: device?.model ?? "",
  });
  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));
  const osItems = DEVICE_OS.map((os) => ({ value: os, label: t(osLabel(os)) }));
  const valid = !!form.deviceUid.trim() && !!appId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      const res = await save(
        device ? { id: device.id, ...form } : { appId, ...form },
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
              {t(device ? "devices.editTitle" : "devices.newTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("devices.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {device || defaults?.appName ? (
            <ScopeFields appName={device?.app_name ?? defaults?.appName} />
          ) : (
            <ScopeFields
              appId={appId}
              onApp={(id) => {
                setAppId(id);
                set({ appUserId: null });
              }}
            />
          )}
          <div className="grid gap-2">
            <Label htmlFor="deviceUid">{t("devices.deviceId")}</Label>
            <Input
              id="deviceUid"
              className="font-mono"
              maxLength={191}
              placeholder="e.g. 8F2C-41A9-…"
              value={form.deviceUid}
              onChange={(e) => set({ deviceUid: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("devices.deviceIdHint")}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deviceFingerprint">
              {t("devices.fingerprint")}
            </Label>
            <Input
              id="deviceFingerprint"
              className="font-mono"
              maxLength={255}
              value={form.fingerprint}
              onChange={(e) => set({ fingerprint: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("devices.fingerprintHint")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="deviceOs">{t("devices.osLabel")}</Label>
              <Select
                items={osItems}
                value={form.os}
                onValueChange={(v) => v && set({ os: v as DeviceOs })}
              >
                <SelectTrigger id="deviceOs" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {osItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deviceModel">{t("devices.model")}</Label>
              <Input
                id="deviceModel"
                maxLength={120}
                placeholder="e.g. Pixel 9"
                value={form.model}
                onChange={(e) => set({ model: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deviceUser">{t("devices.user")}</Label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <CustomerPicker
                  id="deviceUser"
                  appId={appId}
                  value={form.appUserId}
                  onChange={(userId) => set({ appUserId: userId })}
                  current={
                    device?.app_user_id
                      ? { id: device.app_user_id, name: device.user_name ?? "", email: device.user_email ?? null }
                      : null
                  }
                />
              </div>
              {form.appUserId !== null && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ appUserId: null })}>
                  {t("devices.noUser")}
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !valid}>
              {isLoading && <Loader2 className="animate-spin" />}
              {t(device ? "common.save" : "common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
