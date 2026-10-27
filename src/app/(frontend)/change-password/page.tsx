"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/app/auth-shell";
import { SetupAccountForm } from "@/components/app/setup-account-form";
import { useLogout } from "@/components/app/use-logout";
import { useT } from "@/i18n";

/** Forced password change after first login or an admin reset. */
export default function ForcedChangePasswordPage() {
  const t = useT();
  const router = useRouter();
  const { logout, isLoading } = useLogout();

  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("password.forcedTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("password.forcedDescription")}
        </p>
      </div>
      <div className="grid gap-4">
        <SetupAccountForm
          onSuccess={() => {
            router.replace("/");
            router.refresh();
          }}
        />
        <Button variant="ghost" onClick={logout} disabled={isLoading}>
          <LogOut /> {t("common.logout")}
        </Button>
      </div>
    </AuthShell>
  );
}
