"use client";

import { useState } from "react";
import { Check, Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { passwordError, passwordStrength } from "@/lib/password-rules";
import { useCompleteSetupMutation, useMeQuery } from "@/store/api";
import { PasswordInput } from "./password-input";
import { PasswordStrength } from "./password-strength";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First sign in / after admin reset: email + new password, no current password. */
export function SetupAccountForm({ onSuccess }: { onSuccess?: () => void }) {
  const t = useT();
  const { data: me } = useMeQuery();
  const [completeSetup, { isLoading }] = useCompleteSetupMutation();
  // null until edited, so a prefilled email from an earlier setup shows once `me` loads
  const [email, setEmail] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<TranslationKey | null>(null);
  const emailValue = email ?? me?.email ?? "";
  // Save is enabled only at 100% security level with a matching confirmation.
  const canSubmit =
    passwordStrength(newPassword).isStrong &&
    newPassword === confirm &&
    EMAIL_RE.test(emailValue.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(emailValue.trim()))
      return setError("validation.emailInvalid");
    const ruleError = passwordError(newPassword);
    if (ruleError) return setError(ruleError);
    if (newPassword !== confirm) return setError("validation.passwordMismatch");

    setError(null);
    try {
      await completeSetup({ email: emailValue.trim(), newPassword }).unwrap();
      toast.success(t("password.success"));
      onSuccess?.();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <form noValidate onSubmit={submit} className="grid gap-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="email">{t("password.email")}</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            placeholder={t("password.emailPlaceholder")}
            className="h-11 pl-9"
            value={emailValue}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("password.emailHint")}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="newPassword">{t("password.new")}</Label>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          required
          className="h-11"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <PasswordStrength password={newPassword} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">{t("password.confirm")}</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
          className="h-11"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm && (
          <p
            className={
              newPassword === confirm
                ? "flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
                : "flex items-center gap-1.5 text-xs text-destructive"
            }
          >
            {newPassword === confirm ? (
              <Check className="size-3.5" />
            ) : (
              <X className="size-3.5" />
            )}
            {newPassword === confirm
              ? t("password.passwordsMatch")
              : t("validation.passwordMismatch")}
          </p>
        )}
      </div>
      <Button
        type="submit"
        className="h-11 w-full text-base"
        disabled={isLoading || !canSubmit}
      >
        {isLoading && <Loader2 className="animate-spin" />}
        {isLoading ? t("password.submitting") : t("password.setupSubmit")}
      </Button>
    </form>
  );
}
