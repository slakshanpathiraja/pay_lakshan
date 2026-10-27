"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  TriangleAlert,
  User,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/app/auth-shell";
import { PasswordInput } from "@/components/app/password-input";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { useLoginMutation } from "@/store/api";

// Why the user was signed out (set by the API client when the server ends the session).
const REASONS = new Set(["PLATFORM_INACTIVE", "NO_PLATFORM"]);

function SignedOutReason() {
  const t = useT();
  const reason = useSearchParams().get("reason");
  if (!reason || !REASONS.has(reason)) return null;
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertDescription>
        {t(`errors.${reason}` as TranslationKey)}
      </AlertDescription>
    </Alert>
  );
}

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [login, { isLoading }] = useLoginMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError("validation.required");
    setError(null);
    try {
      const user = await login({ username, password }).unwrap();
      router.replace(user.must_change_password ? "/change-password" : "/");
      router.refresh();
    } catch {
      // the API error middleware shows the error
    }
  };

  const trackCapsLock = (e: React.KeyboardEvent) =>
    setCapsLock(e.getModifierState("CapsLock"));

  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("login.welcome")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("login.subtitle")}
        </p>
      </div>

      <form noValidate onSubmit={submit} className="grid gap-5">
        <Suspense fallback={null}>
          <SignedOutReason />
        </Suspense>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <Label htmlFor="username">{t("login.username")}</Label>
          <div className="relative">
            <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              required
              placeholder={t("login.usernamePlaceholder")}
              className="h-11 pl-9"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">{t("login.password")}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              placeholder={t("login.passwordPlaceholder")}
              className="h-11 pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
            />
          </div>
          {capsLock && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-3.5" /> {t("login.capsLock")}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="h-11 w-full text-base"
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="animate-spin" />}
          {isLoading ? t("login.submitting") : t("login.submit")}
        </Button>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("login.forgotHint")}
        </p>
      </form>

      <div className="mt-8 flex items-center justify-center gap-2 border-t pt-6 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
        {t("login.secureNote")}
      </div>
    </AuthShell>
  );
}
