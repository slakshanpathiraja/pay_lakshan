"use client";

import { useState } from "react";
import { ExternalLink, Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyField } from "@/components/app/copy-field";
import { useAccess } from "@/hooks/use-access";
import { useLocale, useT } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { useCreatePayLinkMutation } from "@/store/api";
import type { Order, PayLink } from "@/store/types";

export type PayLinkOrder = Pick<
  Order,
  | "id"
  | "order_number"
  | "payment_status"
  | "status"
  | "pay_url"
  | "pay_url_expires_at"
  | "stripe_subscription_id"
  | "google_product_id"
>;

/**
 * Can get a new Stripe payment link: unpaid (pending / failed), not cancelled, and not a
 * subscription Stripe already bills (a failed renewal's invoice link comes from Stripe), and
 * not paid with Google Play.
 */
export const payLinkable = (o: PayLinkOrder) =>
  (o.payment_status === "pending" || o.payment_status === "failed") &&
  o.status !== "cancelled" &&
  !o.stripe_subscription_id &&
  !o.google_product_id;

/** Whether the order's menu offers "Payment link": it has a working one, or one can be made. */
export function usePayLinkAccess() {
  const { can } = useAccess();
  const canCreate = can("orders.checkout");
  return {
    canCreate: (o: PayLinkOrder) => canCreate && payLinkable(o),
    hasPayLink: (o: PayLinkOrder) =>
      !!o.pay_url || (canCreate && payLinkable(o)),
  };
}

/**
 * The order's Stripe payment link to copy or open, and a new one when it expired (a new link
 * stops the old one). `error`: why the link couldn't be made when the order was created.
 */
export function PayLinkDialog({
  order,
  error,
  onClose,
}: {
  order: PayLinkOrder;
  error?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { canCreate } = usePayLinkAccess();
  const [create, { isLoading }] = useCreatePayLinkMutation();
  const [link, setLink] = useState<{
    url: string;
    expiresAt: string | null;
  } | null>(
    order.pay_url
      ? { url: order.pay_url, expiresAt: order.pay_url_expires_at }
      : null,
  );
  const invoice = !!link && !link.expiresAt; // a failed renewal's Stripe invoice

  const renew = async () => {
    try {
      const res: PayLink = await create({ id: order.id }).unwrap();
      setLink(res);
      toast.success(t("notices.payLinkCreated"));
    } catch {
      // the API error middleware shows the error
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <div className="grid min-w-0 gap-4">
          <DialogHeader>
            <DialogTitle>
              {t("orders.payLinkTitle", { number: order.order_number })}
            </DialogTitle>
            <DialogDescription>
              {t(invoice ? "orders.invoiceLinkHint" : "orders.payLinkHint")}
            </DialogDescription>
          </DialogHeader>
          {link ? (
            <div className="grid gap-1.5">
              <CopyField value={link.url}>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("orders.openLink")}
                  nativeButton={false}
                  render={
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <ExternalLink />
                </Button>
              </CopyField>
              {link.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  {t("orders.linkExpires", {
                    date: formatDateTime(link.expiresAt, locale, ""),
                  })}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm">
              <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                {error
                  ? t("orders.payLinkFailed", { reason: error })
                  : t("orders.noPayLink")}
              </span>
            </div>
          )}
          <DialogFooter className="sm:items-center">
            {canCreate(order) && link && !invoice && (
              <p className="mr-auto text-xs text-muted-foreground">
                {t("orders.newPayLinkHint")}
              </p>
            )}
            <Button variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
            {canCreate(order) && !invoice && (
              <Button
                variant={link ? "outline" : "default"}
                disabled={isLoading}
                onClick={renew}
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                {t(link ? "orders.newPayLink" : "orders.createPayLink")}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
