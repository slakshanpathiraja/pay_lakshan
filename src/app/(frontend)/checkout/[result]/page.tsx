import { CircleCheck, CircleX, Clock } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { defaultLocale, isLocale, type Messages } from "@/i18n/config";
import en from "@/i18n/messages/en";
import si from "@/i18n/messages/si";
import ta from "@/i18n/messages/ta";
import { LOCALE_COOKIE } from "@/lib/session-constants";
import { checkoutReturn } from "@/server/checkout-return";
import { ensureDb } from "@/server/db/init";
import { Redirecting } from "./redirecting";

const dictionaries = { en, si, ta } satisfies Record<string, Messages>;

/**
 * Where Stripe sends the customer back after the payment page. It reads the order's real
 * status and, when the app has a redirect for it (App config), shows a spinner and sends
 * them there; otherwise it shows the result here. Open to everyone.
 */
export default async function CheckoutResultPage({ params, searchParams }: PageProps<"/checkout/[result]">) {
  const { result } = await params;
  if (result !== "success" && result !== "cancelled") notFound();
  const query = await searchParams;
  const number = typeof query.order === "string" ? query.order.slice(0, 24) : "";
  const sessionId = typeof query.session_id === "string" ? query.session_id.slice(0, 255) : undefined;
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const m = dictionaries[isLocale(locale) ? locale : defaultLocale].checkout;

  let status: "success" | "pending" | "failed" | "cancelled" = result;
  if (number) {
    await ensureDb();
    const ret = await checkoutReturn(number, result, sessionId);
    if (ret.url) return <Redirecting url={ret.url} label={m.redirecting} linkLabel={m.continue} />;
    status = ret.status;
  }

  const view = {
    success: { Icon: CircleCheck, tone: "text-emerald-500", title: m.successTitle, text: m.successText },
    pending: { Icon: Clock, tone: "text-amber-500", title: m.pendingTitle, text: m.pendingText },
    failed: { Icon: CircleX, tone: "text-destructive", title: m.failedTitle, text: m.failedText },
    cancelled: { Icon: CircleX, tone: "text-muted-foreground", title: m.cancelledTitle, text: m.cancelledText },
  }[status];

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <view.Icon className={`size-12 ${view.tone}`} />
        <h1 className="text-xl font-semibold">{view.title}</h1>
        <p className="text-sm text-muted-foreground">{view.text.replace("{number}", number)}</p>
      </div>
    </main>
  );
}
