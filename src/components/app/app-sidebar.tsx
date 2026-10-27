"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useT } from "@/i18n";
import { useAccess } from "@/hooks/use-access";
import { activeMenuItem, menuForAccess } from "@/utils/menu";
import { PlatformSwitcher } from "./platform-switcher";

export function AppSidebar() {
  const t = useT();
  const pathname = usePathname();
  const { access, isLoading } = useAccess();
  const { isMobile, setOpenMobile } = useSidebar();
  const active = activeMenuItem(pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Wallet className="size-4" />
              </span>
              <span className="truncate font-semibold">
                {t("common.appName")}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {isLoading ? (
          <SidebarGroup>
            <SidebarMenu>
              {Array.from({ length: 3 }).map((_, i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          menuForAccess(access).map((group) => (
            <SidebarGroup key={group.key}>
              {group.title && (
                <SidebarGroupLabel>{t(group.title)}</SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={active?.key === item.key}
                        tooltip={t(item.title)}
                        render={
                          <Link
                            href={item.href}
                            onClick={() => isMobile && setOpenMobile(false)}
                          />
                        }
                      >
                        <item.icon />
                        <span>{t(item.title)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter>
        <PlatformSwitcher />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
