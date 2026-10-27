"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccess } from "@/hooks/use-access";
import { useT } from "@/i18n";
import { formatPhone } from "@/lib/phone";
import { useAppUsersQuery, useSaveAppUserMutation } from "@/store/api";
import type { AppUser } from "@/store/types";

type Option = {
  value: number;
  label: string;
  email: string | null;
  phone: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Quick add while creating an order: just the email (the API uses it as the name). Enter
 * saves — it sits inside the order form, so no nested <form>.
 */
function NewCustomer({
  appId,
  initialEmail,
  onCreated,
  onCancel,
}: {
  appId: number;
  initialEmail: string;
  onCreated: (user: AppUser) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [save, { isLoading }] = useSaveAppUserMutation();
  const [email, setEmail] = useState(initialEmail);
  const valid = EMAIL_RE.test(email.trim());

  const submit = async () => {
    if (!valid || isLoading) return;
    try {
      const res = await save({
        appId,
        name: "",
        email: email.trim(),
        phone: null,
      }).unwrap();
      toast.success(res.message);
      if (res.user) onCreated(res.user);
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
      <Label htmlFor="newCustomerEmail" className="flex items-center gap-2">
        <UserPlus className="size-4" /> {t("orders.newCustomerEmail")}
      </Label>
      <div className="flex gap-2">
        <Input
          id="newCustomerEmail"
          type="email"
          autoFocus
          maxLength={255}
          placeholder="customer@example.com"
          aria-invalid={!!email.trim() && !valid}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="button" disabled={!valid || isLoading} onClick={submit}>
          {isLoading && <Loader2 className="animate-spin" />}
          {t("orders.addCustomer")}
        </Button>
      </div>
      {!!email.trim() && !valid && (
        <p className="text-xs text-destructive">
          {t("validation.emailInvalid")}
        </p>
      )}
    </div>
  );
}

/**
 * Search an app's (active) users by name, email or phone, or add a new one in place
 * (needs the Users card's create action).
 */
export function CustomerPicker({
  id,
  appId,
  value,
  onChange,
}: {
  id?: string;
  appId: number | undefined;
  value: number | null;
  onChange: (userId: number | null) => void;
}) {
  const t = useT();
  const { can } = useAccess();
  const { data: users = [], isFetching } = useAppUsersQuery(
    { appId },
    { skip: !appId },
  );
  // shown right away, before the list refetches
  const [created, setCreated] = useState<AppUser[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const canAdd = can("users.create") && !!appId;

  const options = useMemo<Option[]>(
    () =>
      [
        ...users,
        ...created.filter(
          (c) => c.app_id === appId && !users.some((u) => u.id === c.id),
        ),
      ]
        .filter((u) => u.is_active)
        .map((u) => ({
          value: u.id,
          label: u.name,
          email: u.email,
          phone: u.phone,
        })),
    [users, created, appId],
  );
  const selected = options.find((o) => o.value === value) ?? null;

  if (adding && appId) {
    return (
      <NewCustomer
        appId={appId}
        initialEmail={
          !selected && EMAIL_RE.test(query.trim()) ? query.trim() : ""
        }
        onCancel={() => setAdding(false)}
        onCreated={(user) => {
          setCreated((c) => [...c, user]);
          onChange(user.id);
          setAdding(false);
        }}
      />
    );
  }

  const search = query.trim().toLowerCase();
  return (
    <div className="flex gap-2">
      <Combobox.Root
        items={options}
        value={selected}
        onValueChange={(o: Option | null) => onChange(o ? o.value : null)}
        onInputValueChange={setQuery}
        itemToStringLabel={(o: Option) => o.label}
        isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
        filter={(o: Option, q: string) => {
          const s = q.trim().toLowerCase();
          const digits = s.replace(/\D/g, "").replace(/^0/, "");
          return (
            !s ||
            [o.label, o.email].some((f) => f?.toLowerCase().includes(s)) ||
            (!!digits && !!o.phone?.includes(digits))
          );
        }}
        autoHighlight
        disabled={!appId}
      >
        <Combobox.InputGroup className="relative min-w-0 flex-1">
          <Combobox.Input
            id={id}
            placeholder={
              appId ? t("orders.searchCustomer") : t("scope.chooseApp")
            }
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-base transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
          />
          <Combobox.Trigger
            aria-label={t("orders.customer")}
            className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground"
          >
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="isolate z-50">
            <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
              <Combobox.Empty>
                <div className="grid gap-2 px-2 py-3 text-sm text-muted-foreground">
                  {options.length
                    ? t("orders.noCustomerMatch")
                    : t("orders.noUsers")}
                  {canAdd && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => setAdding(true)}
                    >
                      <UserPlus />{" "}
                      {search
                        ? t("orders.addNamed", { name: query.trim() })
                        : t("orders.newCustomer")}
                    </Button>
                  )}
                </div>
              </Combobox.Empty>
              <Combobox.List className="max-h-64 overflow-y-auto overscroll-contain outline-0 data-empty:p-0">
                {(o: Option) => (
                  <Combobox.Item
                    key={o.value}
                    value={o}
                    className="flex cursor-default items-center gap-2 rounded-md px-1.5 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">{o.label}</span>
                      {(o.email || o.phone) && (
                        <span className="truncate text-xs text-muted-foreground">
                          {[o.email, o.phone && formatPhone(o.phone)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </span>
                    <Combobox.ItemIndicator>
                      <CheckIcon className="size-4" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("orders.newCustomer")}
          title={t("orders.newCustomer")}
          onClick={() => setAdding(true)}
        >
          <UserPlus />
        </Button>
      )}
    </div>
  );
}
