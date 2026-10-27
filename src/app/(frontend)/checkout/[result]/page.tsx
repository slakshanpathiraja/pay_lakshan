import { CircleCheck, CircleX } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { defaultLocale, isLocale, type Messages } from "@/i18n/config";
import en from "@/i18n/messages/en";
import si from "@/i18n/messages/si";
import ta from "@/i18n/messages/ta";
import { LOCALE_COOKIE } from "@/lib/session-constants";

const dictionaries = { en, si, ta } satisfies Record<string, Messages>;

/**
 * Where Stripe sends the customer back after the payment page, when the app hasn't set its
 * own success / cancelled redirect (App config). Open to everyone.
 */
export default async function CheckoutResultPage({
  params,
  searchParams,
}: PageProps<"/checkout/[result]">) {
  const { result } = await params;
  if (result !== "success" && result !== "cancelled") notFound();
  const order = (await searchParams).order;
  const number = typeof order === "string" ? order.slice(0, 24) : "";
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const m = dictionaries[isLocale(locale) ? locale : defaultLocale].checkout;
  const ok = result === "success";
  const Icon = ok ? CircleCheck : CircleX;

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <Icon
          className={
            ok ? "size-12 text-emerald-500" : "size-12 text-muted-foreground"
          }
        />
        <h1 className="text-xl font-semibold">
          {ok ? m.successTitle : m.cancelledTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {(ok ? m.successText : m.cancelledText).replace("{number}", number)}
        </p>
      </div>
    </main>
  );
}
