"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccess } from "@/hooks/use-access";
import { useT } from "@/i18n";
import { useAppsQuery } from "@/store/api";

// App a page works on. The platform is always the one picked in the platform switcher: it
// isn't shown or chosen here — every request carries it and the API checks it (scope.ts).

export interface Scope {
  /** the active platform */
  platformId: string | undefined;
  /** app filter (undefined = all apps) */
  appId: number | undefined;
  setAppId: (id: number | undefined) => void;
}

export function useScope(): Scope {
  const { me } = useAccess();
  const [appId, setAppId] = useState<number | undefined>();
  return { platformId: me?.platform_id ?? undefined, appId, setAppId };
}

const ALL = "all";

/**
 * The active platform's apps. `allowAll` adds "All apps" (list filters); otherwise the first
 * app is preselected (forms need one).
 */
export function AppSelect({
  id,
  value,
  onChange,
  allowAll,
}: {
  id?: string;
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  allowAll?: boolean;
}) {
  const t = useT();
  const { data: apps = [], isLoading } = useAppsQuery();
  const first = apps[0]?.id;
  const missing =
    !allowAll &&
    first !== undefined &&
    (value === undefined || !apps.some((a) => a.id === value));
  useEffect(() => {
    if (missing) onChange(first);
  }, [missing, first, onChange]);

  const items = [
    ...(allowAll ? [{ value: ALL, label: t("scope.allApps") }] : []),
    ...apps.map((a) => ({ value: String(a.id), label: a.name })),
  ];
  return (
    <Select
      items={items}
      value={value === undefined ? (allowAll ? ALL : null) : String(value)}
      onValueChange={(v) => v && onChange(v === ALL ? undefined : Number(v))}
      disabled={isLoading || (!allowAll && apps.length === 0)}
    >
      <SelectTrigger id={id} className="w-full" aria-label={t("scope.app")}>
        <SelectValue
          placeholder={apps.length ? t("scope.chooseApp") : t("scope.noApps")}
        />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Above a list: the app filter, plus page-specific filters. */
export function ScopeBar({
  scope,
  children,
}: {
  scope: Scope;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <div className="sm:w-56">
        <AppSelect value={scope.appId} onChange={scope.setAppId} allowAll />
      </div>
      {children}
    </div>
  );
}

/**
 * The app of a record: picked when creating (required), shown when editing (`appName`;
 * a record's app doesn't change).
 */
export function ScopeFields({
  appId,
  onApp,
  appName,
}: {
  appId?: number;
  onApp?: (id: number | undefined) => void;
  appName?: string;
}) {
  const t = useT();
  return (
    <div className="grid gap-2">
      <Label htmlFor="scopeApp">{t("scope.app")}</Label>
      {appName !== undefined || !onApp ? (
        <Input id="scopeApp" value={appName ?? ""} disabled />
      ) : (
        <AppSelect id="scopeApp" value={appId} onChange={onApp} />
      )}
    </div>
  );
}
