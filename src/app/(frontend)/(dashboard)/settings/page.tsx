"use client";

import { Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useT } from "@/i18n";

/** Placeholder — settings will be added here. */
export default function SettingsPage() {
  const t = useT();
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("settings.title")}
        </h2>
        <p className="text-muted-foreground">{t("settings.description")}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Settings className="size-6 text-muted-foreground" />
          </span>
          <p className="font-medium">{t("settings.emptyTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("settings.emptyText")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
