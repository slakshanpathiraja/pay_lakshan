"use client";

import Link from "next/link";
import { Building2, Check, ChevronDown, Loader2, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccess } from "@/hooks/use-access";
import { useSwitchPlatform } from "@/hooks/use-switch-platform";
import { useT } from "@/i18n";
import { initials } from "@/lib/format";
import { roleLabel, roleName } from "@/lib/role-label";
import { userMenuItems } from "@/utils/menu";
import { useLogout } from "./use-logout";

/** Top-right account menu: who you are, the active platform (switchable), profile, sign out. */
export function ProfileMenu() {
  const t = useT();
  const { me, canPage } = useAccess();
  const { logout } = useLogout();
  const { select, pendingId } = useSwitchPlatform(me?.platform_id);
  if (!me) return null;

  const displayName = me.full_name || me.username;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted data-popup-open:bg-muted">
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="hidden min-w-0 leading-tight sm:grid">
          <span className="truncate text-sm font-medium">{displayName}</span>
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 className="size-3 shrink-0" />
            {me.platform_name ?? t("platforms.none")}
          </span>
        </div>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="size-10 rounded-lg">
              <AvatarFallback className="rounded-lg bg-primary font-semibold text-primary-foreground">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                @{me.username}
              </p>
              <Badge variant="secondary" className="mt-1">
                {roleLabel(t, me)}
              </Badge>
            </div>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t("platforms.switchTitle")}
          </DropdownMenuLabel>
          {me.platforms.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("platforms.none")}
            </p>
          )}
          {me.platforms.map((p) => {
            const active = p.id === me.platform_id;
            return (
              <DropdownMenuItem key={p.id} onClick={() => select(p.id, p.name)}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Building2 className="size-3.5" />
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate">{p.name}</span>
                  {p.role_name && (
                    <span className="truncate text-xs text-muted-foreground">
                      {roleName(t, { key: p.role_key, name: p.role_name })}
                    </span>
                  )}
                </span>
                {pendingId === p.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  active && <Check className="text-primary" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {userMenuItems.filter(canPage).map((item) => (
            <DropdownMenuItem key={item.key} render={<Link href={item.href} />}>
              <item.icon /> {t(item.title)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={logout}>
          <LogOut /> {t("common.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
