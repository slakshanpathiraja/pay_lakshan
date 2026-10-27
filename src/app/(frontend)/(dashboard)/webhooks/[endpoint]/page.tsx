import { notFound } from "next/navigation";
import { AppApiPage } from "@/components/app/app-api-docs";
import { IncomingWebhookPage } from "@/components/app/incoming-webhook-docs";
import { APP_API_ENDPOINTS, isAppApiEndpoint } from "@/lib/app-api-docs";
import { INCOMING_WEBHOOKS, isIncomingWebhook } from "@/lib/incoming-webhooks-docs";

/** Only these pages exist; any other /webhooks/… is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return [...APP_API_ENDPOINTS, ...INCOMING_WEBHOOKS].map((endpoint) => ({ endpoint }));
}

/**
 * Webhooks menu: an App API endpoint (docs, guide, code, playground), or a webhook a payment
 * provider calls (docs, setup, test).
 */
export default async function WebhookPage({ params }: PageProps<"/webhooks/[endpoint]">) {
  const { endpoint } = await params;
  if (isAppApiEndpoint(endpoint)) return <AppApiPage endpoint={endpoint} />;
  if (isIncomingWebhook(endpoint)) return <IncomingWebhookPage webhook={endpoint} />;
  notFound();
}
