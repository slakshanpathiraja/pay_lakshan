"use client";

import { useState } from "react";
import { AtSign, CalendarDays, Clock, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangePasswordForm } from "@/components/app/change-password-form";
import { useLocale, useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { formatDateTime, initials } from "@/lib/format";
import { roleLabel } from "@/lib/role-label";
import { useMeQuery, useUpdateProfileMutation } from "@/store/api";
import type { User } from "@/store/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function OverviewCard({ me }: { me: User }) {
  const t = useT();
  const { locale } = useLocale();
  const displayName = me.full_name || me.username;

  return (
    <Card>
      <CardContent className="flex flex-col items-center pt-2 text-center">
        <Avatar className="size-20 rounded-2xl">
          <AvatarFallback className="rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
        <h2 className="mt-4 text-lg font-semibold">{displayName}</h2>
        <p className="text-sm text-muted-foreground">@{me.username}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <Badge>{roleLabel(t, me)}</Badge>
          <Badge variant="secondary">{t("dashboard.active")}</Badge>
        </div>
      </CardContent>
      <Separator />
      <CardContent className="grid gap-4">
        <DetailRow
          icon={Mail}
          label={t("profile.email")}
          value={me.email || t("profile.notSet")}
        />
        <DetailRow
          icon={Clock}
          label={t("dashboard.lastLogin")}
          value={formatDateTime(me.last_login_at, locale, t("common.never"))}
        />
        <DetailRow
          icon={CalendarDays}
          label={t("profile.memberSince")}
          value={formatDateTime(me.created_at, locale, "—")}
        />
      </CardContent>
    </Card>
  );
}

function PersonalInfoCard({ me }: { me: User }) {
  const t = useT();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  // null = untouched, so the fields always show the latest saved values
  const [fullName, setFullName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);

  const nameValue = fullName ?? me.full_name ?? "";
  const emailValue = email ?? me.email ?? "";
  const dirty =
    nameValue.trim() !== (me.full_name ?? "") ||
    emailValue.trim() !== (me.email ?? "");
  const emailValid = EMAIL_RE.test(emailValue.trim());

  const reset = () => {
    setFullName(null);
    setEmail(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid) return setError("validation.emailInvalid");
    try {
      await updateProfile({
        fullName: nameValue.trim(),
        email: emailValue.trim(),
      }).unwrap();
      toast.success(t("profile.saved"));
      reset();
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Card>
      {/* `contents` keeps header/content/footer as direct card children for spacing */}
      <form noValidate onSubmit={submit} className="contents">
        <CardHeader>
          <CardTitle>{t("profile.personalTitle")}</CardTitle>
          <CardDescription>{t("profile.personalDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          )}
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="profileUsername">{t("managers.username")}</Label>
              <div className="relative">
                <AtSign className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="profileUsername"
                  value={me.username}
                  disabled
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("profile.usernameHint")}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profileName">{t("profile.fullName")}</Label>
              <Input
                id="profileName"
                maxLength={100}
                placeholder={t("profile.fullNamePlaceholder")}
                value={nameValue}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profileEmail">{t("profile.email")}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profileEmail"
                type="email"
                autoComplete="email"
                maxLength={255}
                placeholder={t("password.emailPlaceholder")}
                className="pl-9"
                value={emailValue}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={reset}
            disabled={!dirty || isLoading}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!dirty || !emailValid || isLoading}>
            {isLoading && <Loader2 className="animate-spin" />}
            {t("profile.saveChanges")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function ProfilePage() {
  const t = useT();
  const { data: me, isLoading } = useMeQuery();

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("profile.title")}
        </h2>
        <p className="text-muted-foreground">{t("profile.description")}</p>
      </div>

      {isLoading || !me ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
          <OverviewCard me={me} />
          <div className="grid gap-6">
            <PersonalInfoCard me={me} />
            <Card>
              <CardHeader>
                <CardTitle>{t("profile.passwordTitle")}</CardTitle>
                <CardDescription>{t("password.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-md">
                  <ChangePasswordForm />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
