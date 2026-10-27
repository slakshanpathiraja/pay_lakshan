"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { passwordError, passwordStrength } from "@/lib/password-rules";
import { useChangePasswordMutation } from "@/store/api";
import type { TranslationKey } from "@/i18n/config";
import { PasswordInput } from "./password-input";
import { PasswordStrength } from "./password-strength";

export function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const t = useT();
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [error, setError] = useState<TranslationKey | null>(null);
  // Update is enabled only at 100% security level with a matching confirmation.
  const canSubmit =
    !!form.currentPassword &&
    passwordStrength(form.newPassword).isStrong &&
    form.newPassword === form.confirm;

  const update =
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ruleError = passwordError(form.newPassword);
    if (ruleError) return setError(ruleError);
    if (form.newPassword !== form.confirm)
      return setError("validation.passwordMismatch");

    setError(null);
    try {
      await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }).unwrap();
      toast.success(t("password.success"));
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      onSuccess?.();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">{t("password.current")}</Label>
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={update("currentPassword")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="newPassword">{t("password.new")}</Label>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          required
          value={form.newPassword}
          onChange={update("newPassword")}
        />
        <PasswordStrength password={form.newPassword} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">{t("password.confirm")}</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={update("confirm")}
        />
        {form.confirm && (
          <p
            className={
              form.newPassword === form.confirm
                ? "flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
                : "flex items-center gap-1.5 text-xs text-destructive"
            }
          >
            {form.newPassword === form.confirm ? (
              <Check className="size-3.5" />
            ) : (
              <X className="size-3.5" />
            )}
            {form.newPassword === form.confirm
              ? t("password.passwordsMatch")
              : t("validation.passwordMismatch")}
          </p>
        )}
      </div>
      <Button type="submit" disabled={isLoading || !canSubmit}>
        {isLoading ? t("password.submitting") : t("password.submit")}
      </Button>
    </form>
  );
}
