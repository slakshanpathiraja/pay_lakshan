"use client";

import Link from "next/link";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  Settings2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAccess } from "@/hooks/use-access";
import { useSwitchPlatform } from "@/hooks/use-switch-platform";
import { useT } from "@/i18n";
import { roleName } from "@/lib/role-label";
import { cn } from "@/lib/utils";
import { allPages } from "@/utils/menu";

function PlatformIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground",
        className,
      )}
    >
      {name ? name.charAt(0).toUpperCase() : <Building2 className="size-4" />}
    </span>
  );
}

/** Sidebar footer: the active platform (name + id), click to pick another from the list. */
export function PlatformSwitcher() {
  const t = useT();
  const { me, canPage, isSuperAdmin } = useAccess();
  const { select, pendingId } = useSwitchPlatform(me?.platform_id);
  if (!me) return null;

  // Super admins manage every platform; everyone else gets the page about their own platform.
  const platformsPage = allPages.find((p) => p.href === "/platforms");
  const manage = isSuperAdmin
    ? platformsPage && canPage(platformsPage)
      ? { href: "/platforms", label: t("platforms.manage") }
      : null
    : me.platform_id
      ? { href: "/my-platform", label: t("platforms.manageMine") }
      : null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent"
              />
            }
          >
            <PlatformIcon name={me.platform_name} />
            <div className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">
                {me.platform_name ?? t("platforms.none")}
              </span>
              {me.platform_id && (
                <span
                  className="truncate font-mono text-[11px] text-muted-foreground"
                  title={me.platform_id}
                >
                  {me.platform_id}
                </span>
              )}
            </div>
            <ChevronsUpDown className="ml-auto size-4 shrink-0" />
          </DropdownMenuTrigger>

          {/* drop-up: opens right above the button, as wide as it */}
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={6}
            className="w-(--anchor-width)"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("platforms.switchTitle")}
              </DropdownMenuLabel>
              {me.platforms.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("platforms.none")}
                </p>
              )}
              {me.platforms.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => select(p.id, p.name)}
                  className="gap-2.5 py-2"
                >
                  <PlatformIcon
                    name={p.name}
                    className="size-7 rounded-md text-xs"
                  />
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{p.name}</span>
                      {!p.is_active && (
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                          {t("status.inactive")}
                        </span>
                      )}
                    </span>
                    <span
                      className="truncate font-mono text-[10px] text-muted-foreground"
                      title={p.id}
                    >
                      {p.id}
                    </span>
                    {p.role_name && (
                      <span className="truncate text-xs text-muted-foreground">
                        {roleName(t, { key: p.role_key, name: p.role_name })}
                      </span>
                    )}
                  </span>
                  {pendingId === p.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    p.id === me.platform_id && (
                      <Check className="text-primary" />
                    )
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {manage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href={manage.href} />}>
                  <Settings2 /> {manage.label}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
