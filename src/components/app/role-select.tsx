"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n";
import { roleName } from "@/lib/role-label";
import { useRoleOptionsQuery } from "@/store/api";

/** Picks one of a platform's roles (the active platform unless `platformId` is given). */
export function RoleSelect({
  id,
  platformId,
  value,
  onChange,
}: {
  id?: string;
  platformId?: string;
  value: number | null;
  onChange: (roleId: number) => void;
}) {
  const t = useT();
  const { data: roles = [], isLoading } = useRoleOptionsQuery(platformId);
  const items = roles.map((r) => ({
    value: String(r.id),
    label: roleName(t, r),
  }));

  return (
    <Select
      items={items}
      value={value === null ? null : String(value)}
      onValueChange={(v) => v && onChange(Number(v))}
      disabled={isLoading || roles.length === 0}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue
          placeholder={roles.length ? t("roles.choose") : t("roles.noneYet")}
        />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
