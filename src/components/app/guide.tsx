"use client";

import { ArrowDown, ArrowRight, Info, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CodeBlock, Rich } from "@/components/app/app-api-docs";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

// Building blocks of the Docs pages (Stripe, Google Play guides): sections with an on-page
// table of contents, flow and status diagrams drawn with plain HTML (they follow the theme and
// wrap on small screens), tables, callouts and code. Text uses `code` backticks (see Rich).

export { CodeBlock, Rich };

/** Who does a step in a flow diagram — each has its own colour. */
export type Actor = "app" | "server" | "stripe" | "google" | "customer";

const ACTOR_STYLE: Record<Actor, { box: string; dot: string; label: string }> = {
  app: { box: "border-violet-500/40 bg-violet-500/10", dot: "bg-violet-500", label: "Your app" },
  server: { box: "border-border bg-muted/60", dot: "bg-muted-foreground", label: "This server" },
  stripe: { box: "border-sky-500/40 bg-sky-500/10", dot: "bg-sky-500", label: "Stripe" },
  google: { box: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-500", label: "Google Play" },
  customer: { box: "border-amber-500/40 bg-amber-500/10", dot: "bg-amber-500", label: "Customer" },
};

export interface FlowStep {
  actor: Actor;
  title: string;
  detail?: string;
}

/** Numbered steps top to bottom, coloured by who does them, with a legend. */
export function FlowDiagram({ steps, footer }: { steps: FlowStep[]; footer?: string }) {
  const actors = [...new Set(steps.map((s) => s.actor))];
  return (
    <figure className="grid gap-3">
      <ol className="mx-auto grid w-full max-w-xl gap-0">
        {steps.map((s, i) => (
          <li key={i} className="grid justify-items-center">
            <div className={cn("w-full rounded-lg border px-4 py-3", ACTOR_STYLE[s.actor].box)}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold">
                  {i + 1}
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <span className="text-sm font-medium">
                    <Rich text={s.title} />
                  </span>
                  {s.detail && (
                    <span className="text-xs text-muted-foreground">
                      <Rich text={s.detail} />
                    </span>
                  )}
                </div>
              </div>
            </div>
            {i < steps.length - 1 && <ArrowDown className="my-1 size-4 text-muted-foreground" aria-hidden />}
          </li>
        ))}
      </ol>
      {footer && (
        <p className="text-center text-xs text-muted-foreground">
          <Rich text={footer} />
        </p>
      )}
      <figcaption className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {actors.map((a) => (
          <span key={a} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", ACTOR_STYLE[a].dot)} /> {ACTOR_STYLE[a].label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

const STATE_TONE = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  expired: "border-border bg-muted text-muted-foreground",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;
export type OrderState = keyof typeof STATE_TONE;

export function StateChip({ state }: { state: OrderState }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", STATE_TONE[state])}>
      {state}
    </span>
  );
}

/** An order's status changes: "from → to" with what causes it. */
export function StateDiagram({ moves }: { moves: { from: OrderState; to: OrderState; when: string }[] }) {
  return (
    <div className="grid gap-2">
      {moves.map((m, i) => (
        <div key={i} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[auto_auto_auto_1fr]">
          <StateChip state={m.from} />
          <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
          <StateChip state={m.to} />
          <span className="text-sm text-muted-foreground">
            <Rich text={m.when} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A simple table: header row + rows of text (with `code`). */
export function DocTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j} className={cn("align-top text-sm whitespace-normal", j === 0 && "font-medium")}>
                <Rich text={c} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Callout({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3 text-sm",
        tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-sky-500/30 bg-sky-500/5",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

/** Numbered steps (text with `code`). */
export function Steps({ steps }: { steps: string[] }) {
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

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="grid list-disc gap-1.5 pl-5 text-sm">
      {items.map((s) => (
        <li key={s}>
          <Rich text={s} />
        </li>
      ))}
    </ul>
  );
}

export interface GuideSection {
  id: string;
  title: string;
  description?: string;
  body: React.ReactNode;
}

/** The page: title, summary, contents (links to sections), then each section as a card. */
export function Guide({ title, summary, sections }: { title: string; summary: string; sections: GuideSection[] }) {
  const t = useT();
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <div className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">
          <Rich text={summary} />
        </p>
        <p className="text-xs text-muted-foreground">{t("webhooks.englishNote")}</p>
      </div>
      <nav aria-label={t("guides.contents")} className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">{t("guides.contents")}</p>
        <ol className="grid list-decimal gap-1 pl-5 text-sm sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-primary hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((s) => (
        <Card key={s.id} id={s.id} className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{s.title}</CardTitle>
            {s.description && (
              <CardDescription>
                <Rich text={s.description} />
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">{s.body}</CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A heading inside a section. */
export function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}
