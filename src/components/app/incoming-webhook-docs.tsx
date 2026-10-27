"use client";

import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock, Rich } from "@/components/app/app-api-docs";
import { MethodBadge } from "@/components/app/method-badge";
import { ToneBadge } from "@/components/app/tone-badge";
import { useT } from "@/i18n";
import { INCOMING_DOCS, type IncomingDoc, type IncomingWebhook } from "@/lib/incoming-webhooks-docs";

// The Webhooks pages for what payment providers call (Stripe, Google Play): docs, setup and
// how to test. No playground — these requests are signed by Stripe / Google, not by you.

const json = (v: unknown) => JSON.stringify(v, null, 2);

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
      {steps.map((s) => (
        <li key={s}>
          <Rich text={s} />
        </li>
      ))}
    </ol>
  );
}

function DocsTab({ doc }: { doc: IncomingDoc }) {
  const t = useT();
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> {t("webhooks.verification")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm">
            {doc.verification.map((v) => (
              <li key={v}>
                <Rich text={v} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.events")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("webhooks.event")}</TableHead>
                <TableHead>{t("webhooks.effect")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.events.map((e) => (
                <TableRow key={e.name}>
                  <TableCell className="align-top font-mono text-xs whitespace-normal">{e.name}</TableCell>
                  <TableCell className="min-w-56 align-top text-sm whitespace-normal">
                    <Rich text={e.effect} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.request")}</CardTitle>
          <CardDescription>{doc.sample.label}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <CodeBlock
            code={`POST ${doc.path}\n${Object.entries(doc.sample.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}`}
          />
          <CodeBlock code={json(doc.sample.body)} />
          {doc.sample.decoded !== undefined && (
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t("webhooks.decoded")}</p>
              <CodeBlock code={json(doc.sample.decoded)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.responses")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {doc.responses.map((r) => (
                <TableRow key={r.when}>
                  <TableCell className="w-16 align-top">
                    <ToneBadge tone={r.status < 300 ? "green" : r.status < 500 ? "amber" : "red"}>{r.status}</ToneBadge>
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    <Rich text={r.when} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.environment")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Table>
            <TableBody>
              {doc.env.map((e) => (
                <TableRow key={e.name}>
                  <TableCell className="align-top font-mono text-xs whitespace-nowrap">{e.name}</TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    <Rich text={e.description} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CodeBlock code={doc.env.map((e) => `${e.name}=${e.example}`).join("\n")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.notes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm">
            {doc.notes.map((n) => (
              <li key={n}>
                <Rich text={n} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function IncomingWebhookPage({ webhook }: { webhook: IncomingWebhook }) {
  const t = useT();
  const doc = INCOMING_DOCS[webhook];
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
      <div className="grid gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{doc.title}</h2>
        <p className="text-muted-foreground">{doc.summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method="POST" />
          <code className="font-mono text-sm">{doc.path}</code>
          <ToneBadge tone="muted">
            {t("webhooks.calledBy")}: {doc.caller}
          </ToneBadge>
        </div>
        <p className="text-xs text-muted-foreground">{t("webhooks.englishNote")}</p>
      </div>
      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">{t("webhooks.docs")}</TabsTrigger>
          <TabsTrigger value="setup">{t("webhooks.setup")}</TabsTrigger>
          <TabsTrigger value="test">{t("webhooks.test")}</TabsTrigger>
        </TabsList>
        <TabsContent value="docs" className="mt-2">
          <DocsTab doc={doc} />
        </TabsContent>
        <TabsContent value="setup" className="mt-2">
          <div className="grid gap-6">
            {doc.setup.map((s) => (
              <Card key={s.title}>
                <CardHeader>
                  <CardTitle>{s.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Steps steps={s.steps} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="test" className="mt-2">
          <div className="grid gap-6">
            {doc.test.map((s) => (
              <Card key={s.title}>
                <CardHeader>
                  <CardTitle>{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Steps steps={s.steps} />
                  {s.commands?.map((c) => <CodeBlock key={c} code={c} />)}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
