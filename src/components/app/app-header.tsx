"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useT } from "@/i18n";
import { activeMenuItem } from "@/utils/menu";
import { LanguageSwitcher } from "./language-switcher";
import { ProfileMenu } from "./profile-menu";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader() {
  const t = useT();
  const item = activeMenuItem(usePathname());

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="truncate text-sm font-medium">
        {item ? t(item.title) : ""}
      </h1>
      <div className="ml-auto flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ProfileMenu />
      </div>
    </header>
  );
}
