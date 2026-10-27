"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/use-access";
import { useT } from "@/i18n";
import { activeMenuItem, allPages } from "@/utils/menu";

/** Renders the page only if the user's role grants its URL; otherwise a "no access" state. */
export function AccessGuard({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const { me, canPage } = useAccess();
  const router = useRouter();
  const page = activeMenuItem(pathname);
  const allowed = !page || canPage(page);
  // A role without the Dashboard card lands on its first allowed page (Profile at worst).
  const fallback =
    pathname === "/" && me && !allowed
      ? (allPages.find(canPage)?.href ?? "/profile")
      : null;

  useEffect(() => {
    if (fallback) router.replace(fallback);
  }, [fallback, router]);

  if (!me || fallback) return <Skeleton className="h-64" />;
  if (allowed) return <>{children}</>;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="size-6 text-destructive" />
        </span>
        <p className="font-medium">{t("access.deniedTitle")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("access.deniedText")}
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/" />}
        >
          {t("access.backHome")}
        </Button>
      </CardContent>
    </Card>
  );
}
