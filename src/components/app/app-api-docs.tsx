"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, Lock, RotateCcw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MethodBadge } from "@/components/app/method-badge";
import { PasswordInput } from "@/components/app/password-input";
import { ToneBadge } from "@/components/app/tone-badge";
import { useAccess } from "@/hooks/use-access";
import { useT } from "@/i18n";
import {
  APP_API_DOCS,
  COMMON_ERRORS,
  SIGNED_PARAMS,
  canonicalString,
  type ApiDoc,
  type ApiError,
  type ApiParam,
} from "@/lib/app-api-docs";
import { cn } from "@/lib/utils";
import { useAppsQuery, useLazyAppCredentialsQuery } from "@/store/api";

// The Webhooks pages: one per App API endpoint, with its docs, a guide, code samples and a
// playground that signs and sends real requests from this browser tab.

/** HMAC-SHA256 hex in the browser (Web Crypto), the same as the server checks. */
async function hmacHex(secret: string, text: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (v: unknown) => JSON.stringify(v, null, 2);
/** The sample values (parameters without one, like `template`, are left out). */
const sampleValues = (doc: ApiDoc) =>
  Object.fromEntries(doc.params.filter((p) => p.example !== "").map((p) => [p.name, p.example]));

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("managers.copyFailed"));
    }
  };
  return (
    <div className={cn("group relative min-w-0", className)}>
      <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/50 p-3 pr-10 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5"
        aria-label={t("apps.copy")}
        onClick={copy}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/** Docs text: `code` in backticks and **bold** in double asterisks. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("`") ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {part.slice(1, -1)}
          </code>
        ) : part.startsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function EndpointLine({ doc }: { doc: ApiDoc }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MethodBadge method={doc.method} />
      <code className="font-mono text-sm">{doc.path}</code>
      <ToneBadge tone={doc.token ? "amber" : "muted"}>
        {doc.token ? <Lock className="mr-1 size-3" /> : <KeyRound className="mr-1 size-3" />}
        {t(doc.token ? "webhooks.needsToken" : "webhooks.signedOnly")}
      </ToneBadge>
    </div>
  );
}

// --- Docs -----------------------------------------------------------------------------------

function ParamsTable({ params, muted }: { params: ApiParam[]; muted?: boolean }) {
  const t = useT();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("webhooks.name")}</TableHead>
          <TableHead>{t("webhooks.required")}</TableHead>
          <TableHead>{t("webhooks.description")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("webhooks.example")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {params.map((p) => (
          <TableRow key={p.name} className={muted ? "text-muted-foreground" : undefined}>
            <TableCell className="align-top font-mono text-xs whitespace-nowrap">
              {p.name}
              <span className="ml-1 text-muted-foreground">string</span>
            </TableCell>
            <TableCell className="align-top text-xs whitespace-nowrap">
              {p.required === true ? (
                <ToneBadge tone="amber">{t("webhooks.required")}</ToneBadge>
              ) : p.required === "if" ? (
                <ToneBadge tone="muted">{t("webhooks.requiredIf")}</ToneBadge>
              ) : (
                t("webhooks.optional")
              )}
            </TableCell>
            <TableCell className="min-w-56 align-top text-sm whitespace-normal">
              <Rich text={p.description} />
              {p.options && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {t("webhooks.allowed")}:
                  {p.options.map((o) => (
                    <code key={o} className="rounded bg-muted px-1 font-mono">
                      {o}
                    </code>
                  ))}
                </div>
              )}
            </TableCell>
            <TableCell className="hidden align-top font-mono text-xs md:table-cell">{p.example}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ErrorsTable({ errors }: { errors: ApiError[] }) {
  const t = useT();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">{t("webhooks.status")}</TableHead>
          <TableHead>error</TableHead>
          <TableHead>{t("webhooks.when")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {errors.map((e) => (
          <TableRow key={e.code}>
            <TableCell className="align-top font-mono text-xs">{e.status}</TableCell>
            <TableCell className="align-top font-mono text-xs whitespace-nowrap">{e.code}</TableCell>
            <TableCell className="min-w-56 align-top text-sm whitespace-normal">
              <Rich text={e.when} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DocsTab({ doc }: { doc: ApiDoc }) {
  const t = useT();
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.parameters")}</CardTitle>
          <CardDescription>
            <Rich
              text={
                doc.method === "GET"
                  ? "Query string parameters. Every value is a string; unknown parameters are refused."
                  : "JSON body. Every value is a string (\"1\", not 1); unknown fields are refused."
              }
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ParamsTable params={doc.params} />
          <p className="text-xs font-medium text-muted-foreground">{t("webhooks.signedParams")}</p>
          <ParamsTable params={SIGNED_PARAMS} muted />
          {doc.token && (
            <p className="text-sm">
              <Rich text="Header: `Authorization: Bearer <accessToken>` — from /user or /refresh." />
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.responses")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {doc.responses.map((r) => (
            <div key={r.label} className="grid gap-1.5">
              <div className="flex items-center gap-2 text-sm">
                <ToneBadge tone="green">{r.status}</ToneBadge>
                {r.label}
              </div>
              <CodeBlock code={json(r.example)} />
            </div>
          ))}
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 text-sm">
              <ToneBadge tone="red">4xx</ToneBadge>
              Error
            </div>
            <CodeBlock
              code={json({
                error: "VALIDATION_ERROR",
                message: "Please check the form and try again",
                details: [{ path: "email", message: "Invalid email address" }],
              })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.errors")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ErrorsTable errors={doc.errors} />
          <p className="text-xs font-medium text-muted-foreground">{t("webhooks.commonErrors")}</p>
          <ErrorsTable errors={COMMON_ERRORS} />
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

// --- Guide ----------------------------------------------------------------------------------

const DEMO_SECRET = "sk_demo_secret_for_this_guide";
const DEMO_KEY = "ak_demo0000000000000000000000000";
const DEMO_TIME = "1767225600";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[2rem_1fr] gap-3">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <div className="grid min-w-0 gap-2">
        <h3 className="font-medium">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function GuideTab({ doc }: { doc: ApiDoc }) {
  const params = { appKey: DEMO_KEY, timestamp: DEMO_TIME, ...sampleValues(doc) };
  const text = canonicalString(params);
  const [signature, setSignature] = useState("…");
  useEffect(() => {
    let live = true;
    hmacHex(DEMO_SECRET, text).then((s) => live && setSignature(s));
    return () => {
      live = false;
    };
  }, [text]);

  return (
    <Card>
      <CardContent className="grid gap-6 pt-6 text-sm">
        <Step n={1} title="Get the app's credentials">
          <p>
            <Rich text="In the dashboard: Apps → the app's menu → View. You get the `appKey` (public, identifies the app) and the `appSecret` (private — keep it on your server or in your app's secure storage; never put it in a web page)." />
          </p>
        </Step>
        <Step n={2} title="Build the parameters">
          <p>
            <Rich text="All values are strings. Add `appKey` and `timestamp` (current Unix time in seconds — it must be within 5 minutes of the server's clock, so a copied request can't be sent again later)." />
          </p>
          <CodeBlock code={json(params)} />
        </Step>
        <Step n={3} title="Sign them">
          <p>
            <Rich text="Sort the parameters by name, join them as `name=value` with `&` (values as they are, not URL-encoded; `signature` itself is left out), and take HMAC-SHA256 of that text with the app secret, as lowercase hex." />
          </p>
          <p className="text-xs text-muted-foreground">
            Signed text (with the demo secret <code className="font-mono">{DEMO_SECRET}</code>):
          </p>
          <CodeBlock code={text} />
          <CodeBlock code={`signature = ${signature}`} />
        </Step>
        <Step n={4} title="Send the request">
          <p>
            <Rich
              text={
                doc.method === "GET"
                  ? `GET \`${doc.path}\` with all parameters (and \`signature\`) in the query string.`
                  : `POST \`${doc.path}\` with \`Content-Type: application/json\` and all parameters (and \`signature\`) as the JSON body.`
              }
            />
          </p>
          {doc.token && (
            <p>
              <Rich text="Add the header `Authorization: Bearer <accessToken>` (from Sign in user). When it expires (after 1 hour) you get `INVALID_TOKEN`: call Refresh token and try again." />
            </p>
          )}
        </Step>
        <Step n={5} title="Read the answer">
          <p>
            <Rich text="Success: 200 / 201 with JSON (see Docs). An error has the same shape every time — `{ error, message, details? }` — check `error`, the code, not the message (it may be translated)." />
          </p>
        </Step>
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="mb-2 font-medium">The usual flow</p>
          <ol className="grid list-decimal gap-1 pl-5">
            <li>
              <Rich text="Sign in user → keep `accessToken` and `refreshToken`." />
            </li>
            <li>
              <Rich text="Register device → once per sign in." />
            </li>
            <li>
              <Rich text="Create order → open `payUrl`; the customer pays on Stripe." />
            </li>
            <li>
              <Rich text="Verify orders → give access while an order is `active` and `expiresAt` is null or in the future." />
            </li>
            <li>
              <Rich text="Refresh token → whenever a request returns `INVALID_TOKEN`." />
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Code -----------------------------------------------------------------------------------

function samples(doc: ApiDoc) {
  const values = sampleValues(doc);
  const get = doc.method === "GET";
  const fields = Object.entries(values)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join("\n");
  const pyFields = Object.entries(values)
    .map(([k, v]) => `    "${k}": ${JSON.stringify(v)},`)
    .join("\n");
  const node = `import crypto from "node:crypto";

const BASE_URL = "https://your-domain";
const APP_KEY = process.env.APP_KEY;
const APP_SECRET = process.env.APP_SECRET;${doc.token ? '\nconst accessToken = "…"; // from /api/webhooks/user' : ""}

// sorted name=value pairs joined with &, HMAC-SHA256 with the app secret, hex
function sign(params) {
  const text = Object.keys(params).sort().map((k) => \`\${k}=\${params[k]}\`).join("&");
  return crypto.createHmac("sha256", APP_SECRET).update(text).digest("hex");
}

const params = {
  appKey: APP_KEY,
  timestamp: String(Math.floor(Date.now() / 1000)),
${fields}
};
params.signature = sign(params);

const res = await fetch(${get ? `\`\${BASE_URL}${doc.path}?\${new URLSearchParams(params)}\`` : `\`\${BASE_URL}${doc.path}\``}, {
  method: "${doc.method}",
  headers: {${get ? "" : ' "Content-Type": "application/json",'}${doc.token ? " Authorization: `Bearer ${accessToken}`," : ""} },${get ? "" : "\n  body: JSON.stringify(params),"}
});
const data = await res.json();
if (!res.ok) throw new Error(\`\${data.error}: \${data.message}\`);
console.log(data);`;

  const python = `import hashlib, hmac, os, time
import requests

BASE_URL = "https://your-domain"
APP_KEY = os.environ["APP_KEY"]
APP_SECRET = os.environ["APP_SECRET"]${doc.token ? '\naccess_token = "…"  # from /api/webhooks/user' : ""}

def sign(params: dict) -> str:
    text = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return hmac.new(APP_SECRET.encode(), text.encode(), hashlib.sha256).hexdigest()

params = {
    "appKey": APP_KEY,
    "timestamp": str(int(time.time())),
${pyFields}
}
params["signature"] = sign(params)

res = requests.${get ? "get" : "post"}(
    f"{BASE_URL}${doc.path}",
    ${get ? "params=params" : "json=params"},${doc.token ? '\n    headers={"Authorization": f"Bearer {access_token}"},' : ""}
)
print(res.status_code, res.json())`;

  // cURL: the sorted text is built by hand, so list the parameters in name order
  const names = ["appKey", "timestamp", ...Object.keys(values)].sort();
  const shellValue = (k: string) => (k === "appKey" ? "$APP_KEY" : k === "timestamp" ? "$TS" : values[k]);
  const text = names.map((k) => `${k}=${shellValue(k)}`).join("&");
  const bodyJson = [...names, "signature"]
    .map((k) => `\\"${k}\\":\\"${k === "signature" ? "$SIG" : shellValue(k)}\\"`)
    .join(",");
  const curl = `APP_KEY="ak_…"
APP_SECRET="sk_…"${doc.token ? '\nACCESS_TOKEN="…"   # from /api/webhooks/user' : ""}
TS=$(date +%s)

# parameters sorted by name, joined with &
TEXT="${text}"
SIG=$(printf '%s' "$TEXT" | openssl dgst -sha256 -hmac "$APP_SECRET" | sed 's/^.*= //')

${
  get
    ? `curl -G "https://your-domain${doc.path}" \\
${[...names, "signature"].map((k) => `  --data-urlencode "${k}=${k === "signature" ? "$SIG" : shellValue(k)}"`).join(" \\\n")}${doc.token ? ' \\\n  -H "Authorization: Bearer $ACCESS_TOKEN"' : ""}`
    : `curl -X POST "https://your-domain${doc.path}" \\
  -H "Content-Type: application/json" \\${doc.token ? '\n  -H "Authorization: Bearer $ACCESS_TOKEN" \\' : ""}
  -d "{${bodyJson}}"`
}`;
  return { node, python, curl };
}

function CodeTab({ doc }: { doc: ApiDoc }) {
  const code = samples(doc);
  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="node">
          <TabsList variant="line">
            <TabsTrigger value="node">Node.js</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
            <TabsTrigger value="curl">cURL</TabsTrigger>
          </TabsList>
          <TabsContent value="node">
            <CodeBlock code={code.node} />
          </TabsContent>
          <TabsContent value="python">
            <CodeBlock code={code.python} />
          </TabsContent>
          <TabsContent value="curl">
            <CodeBlock code={code.curl} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// --- Playground -----------------------------------------------------------------------------

const STORE = "pay.appApiPlayground";

interface PlaygroundSession {
  appKey: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
  /** the last signed-in email (Verify orders starts with it) */
  email: string;
}
const EMPTY: PlaygroundSession = { appKey: "", appSecret: "", accessToken: "", refreshToken: "", email: "" };

/**
 * Kept in sessionStorage so all Webhooks pages share it while the tab is open (the secret
 * included — it's gone when the tab closes). The page only renders in the browser.
 */
function usePlaygroundSession() {
  const [session, setSession] = useState<PlaygroundSession>(() => {
    try {
      const raw = typeof window === "undefined" ? null : sessionStorage.getItem(STORE);
      return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
    } catch {
      return EMPTY;
    }
  });
  const update = (patch: Partial<PlaygroundSession>) =>
    setSession((s) => {
      const next = { ...s, ...patch };
      try {
        sessionStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        // private mode: it just isn't kept
      }
      return next;
    });
  return [session, update] as const;
}

/** Fills the key and secret from one of the platform's apps, for roles that may see them. */
function AppPicker({ onPick }: { onPick: (key: string, secret: string) => void }) {
  const t = useT();
  const { data: apps } = useAppsQuery();
  const [fetchCredentials, { isFetching }] = useLazyAppCredentialsQuery();
  const items = (apps ?? []).map((a) => ({ value: String(a.id), label: a.name }));
  if (!items.length) return null;
  return (
    <div className="grid gap-2">
      <Label>{t("webhooks.useApp")}</Label>
      <Select
        items={items}
        value={null}
        onValueChange={async (v) => {
          if (!v) return;
          try {
            const { credentials } = await fetchCredentials(Number(v)).unwrap();
            onPick(credentials.appKey, credentials.appSecret);
          } catch {
            // the API error middleware shows the error
          }
        }}
      >
        <SelectTrigger className="w-full" disabled={isFetching}>
          <SelectValue placeholder={t("webhooks.chooseApp")} />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface Sent {
  text: string;
  signature: string;
  curl: string;
  status: number;
  ms: number;
  body: unknown;
}

function PlaygroundTab({ doc }: { doc: ApiDoc }) {
  const t = useT();
  const { can } = useAccess();
  const [session, update] = usePlaygroundSession();
  const initial = () => {
    const v = sampleValues(doc);
    if (doc.key === "verify" && session.email) v.email = session.email;
    if (doc.key === "refresh" && session.refreshToken) v.refreshToken = session.refreshToken;
    return v;
  };
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const canPickApp = can("apps.list") && can("apps.credentials");

  const send = async () => {
    if (!session.appKey || !session.appSecret) return toast.error(t("webhooks.missingCredentials"));
    if (doc.token && !session.accessToken) return toast.error(t("webhooks.missingToken"));
    setSending(true);
    try {
      // optional fields left empty are not sent (nor signed)
      const fields = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
      const params: Record<string, string> = {
        appKey: session.appKey,
        timestamp: String(Math.floor(Date.now() / 1000)),
        ...fields,
      };
      const text = canonicalString(params);
      const signature = await hmacHex(session.appSecret, text);
      const signed = { ...params, signature };
      const get = doc.method === "GET";
      const url = get ? `${doc.path}?${new URLSearchParams(signed)}` : doc.path;
      const headers: Record<string, string> = {};
      if (!get) headers["Content-Type"] = "application/json";
      if (doc.token) headers.Authorization = `Bearer ${session.accessToken}`;
      const started = performance.now();
      // credentials: "omit" — sent like an app would, without the dashboard's cookie
      const res = await fetch(url, {
        method: doc.method,
        headers,
        body: get ? undefined : JSON.stringify(signed),
        credentials: "omit",
      });
      const body = await res.json().catch(() => null);
      const origin = window.location.origin;
      const curl = [
        `curl ${get ? "" : "-X POST "}"${origin}${url}"`,
        ...Object.entries(headers).map(([k, v]) => `  -H "${k}: ${v}"`),
        ...(get ? [] : [`  -d '${JSON.stringify(signed)}'`]),
      ].join(" \\\n");
      setSent({ text, signature, curl, status: res.status, ms: Math.round(performance.now() - started), body });

      // keep what the other pages need
      if (res.ok && body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        if (doc.key === "user") {
          update({
            accessToken: String(b.accessToken ?? ""),
            refreshToken: String(b.refreshToken ?? ""),
            email: String((b.user as { email?: string } | undefined)?.email ?? values.email ?? ""),
          });
          toast.success(t("webhooks.tokensSaved"));
        } else if (doc.key === "refresh") {
          update({
            accessToken: String(b.accessToken ?? ""),
            ...(b.refreshTokenRotated ? { refreshToken: String(b.refreshToken ?? "") } : {}),
          });
          if (b.refreshTokenRotated) setValues((v) => ({ ...v, refreshToken: String(b.refreshToken ?? "") }));
          toast.success(t("webhooks.tokensSaved"));
        }
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const payUrl =
    doc.key === "order" && sent && typeof sent.body === "object" && sent.body
      ? ((sent.body as { order?: { payUrl?: string | null } }).order?.payUrl ?? null)
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("webhooks.credentials")}</CardTitle>
            <CardDescription>{t("webhooks.credentialsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {canPickApp && <AppPicker onPick={(appKey, appSecret) => update({ appKey, appSecret })} />}
            <div className="grid gap-2">
              <Label htmlFor="pgKey">{t("webhooks.appKey")}</Label>
              <Input
                id="pgKey"
                className="font-mono text-xs"
                placeholder="ak_…"
                value={session.appKey}
                onChange={(e) => update({ appKey: e.target.value.trim() })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pgSecret">{t("webhooks.appSecret")}</Label>
              <PasswordInput
                id="pgSecret"
                autoComplete="off"
                className="font-mono text-xs"
                placeholder="sk_…"
                value={session.appSecret}
                onChange={(e) => update({ appSecret: e.target.value.trim() })}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("webhooks.tokens")}</CardTitle>
            <CardDescription>{t("webhooks.tokensHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pgAccess">{t("webhooks.accessToken")}</Label>
              <Input
                id="pgAccess"
                className="font-mono text-xs"
                value={session.accessToken}
                onChange={(e) => update({ accessToken: e.target.value.trim() })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pgRefresh">{t("webhooks.refreshToken")}</Label>
              <Input
                id="pgRefresh"
                className="font-mono text-xs"
                value={session.refreshToken}
                onChange={(e) => update({ refreshToken: e.target.value.trim() })}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={!session.accessToken && !session.refreshToken}
              onClick={() => update({ accessToken: "", refreshToken: "" })}
            >
              <Trash2 /> {t("webhooks.clearTokens")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("webhooks.request")}
              <MethodBadge method={doc.method} />
            </CardTitle>
            <CardDescription className="font-mono text-xs">{doc.path}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {doc.params.map((p) => (
                <div key={p.name} className="grid content-start gap-1.5">
                  <Label htmlFor={`pg-${p.name}`} className="font-mono text-xs">
                    {p.name}
                    {p.required === true && <span className="text-destructive">*</span>}
                  </Label>
                  {p.options ? (
                    <Select
                      items={[
                        ...(p.required === true ? [] : [{ value: "", label: "—" }]),
                        ...p.options.map((o) => ({ value: o, label: o })),
                      ]}
                      value={values[p.name] ?? ""}
                      onValueChange={(v) => setValues((s) => ({ ...s, [p.name]: v ?? "" }))}
                    >
                      <SelectTrigger id={`pg-${p.name}`} className="w-full font-mono text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {p.required !== true && <SelectItem value="">—</SelectItem>}
                        {p.options.map((o) => (
                          <SelectItem key={o} value={o} className="font-mono text-xs">
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : p.secret ? (
                    <PasswordInput
                      id={`pg-${p.name}`}
                      autoComplete="off"
                      className="font-mono text-xs"
                      value={values[p.name] ?? ""}
                      onChange={(e) => setValues((s) => ({ ...s, [p.name]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`pg-${p.name}`}
                      className="font-mono text-xs"
                      value={values[p.name] ?? ""}
                      onChange={(e) => setValues((s) => ({ ...s, [p.name]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
            <Alert>
              <AlertDescription>{t("webhooks.liveData")}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setValues(initial())}>
                <RotateCcw /> {t("webhooks.sampleData")}
              </Button>
              <Button disabled={sending} onClick={send}>
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
                {t("webhooks.send")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("webhooks.response")}
              {sent && (
                <>
                  <ToneBadge tone={sent.status < 300 ? "green" : sent.status < 500 ? "amber" : "red"}>
                    {sent.status}
                  </ToneBadge>
                  <span className="text-xs font-normal text-muted-foreground">{sent.ms} ms</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {sent ? (
              <>
                <CodeBlock code={json(sent.body)} />
                {payUrl && (
                  <Button
                    variant="outline"
                    className="w-fit"
                    nativeButton={false}
                    render={<a href={payUrl} target="_blank" rel="noopener noreferrer" />}
                  >
                    <ExternalLink /> {t("webhooks.openPayUrl")}
                  </Button>
                )}
                <div className="grid gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{t("webhooks.signedText")}</p>
                  <CodeBlock code={sent.text} />
                </div>
                <div className="grid gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{t("webhooks.signature")}</p>
                  <CodeBlock code={sent.signature} />
                </div>
                <div className="grid gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{t("webhooks.curl")}</p>
                  <CodeBlock code={sent.curl} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("webhooks.noResponse")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// --- page -----------------------------------------------------------------------------------

export function AppApiPage({ endpoint }: { endpoint: keyof typeof APP_API_DOCS }) {
  const t = useT();
  const doc = APP_API_DOCS[endpoint];
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
      <div className="grid gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{doc.title}</h2>
        <p className="text-muted-foreground">{doc.summary}</p>
        <EndpointLine doc={doc} />
        <p className="text-xs text-muted-foreground">{t("webhooks.englishNote")}</p>
      </div>
      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">{t("webhooks.docs")}</TabsTrigger>
          <TabsTrigger value="guide">{t("webhooks.guide")}</TabsTrigger>
          <TabsTrigger value="code">{t("webhooks.code")}</TabsTrigger>
          <TabsTrigger value="playground">{t("webhooks.playground")}</TabsTrigger>
        </TabsList>
        <TabsContent value="docs" className="mt-2">
          <DocsTab doc={doc} />
        </TabsContent>
        <TabsContent value="guide" className="mt-2">
          <GuideTab doc={doc} />
        </TabsContent>
        <TabsContent value="code" className="mt-2">
          <CodeTab doc={doc} />
        </TabsContent>
        <TabsContent value="playground" className="mt-2">
          <PlaygroundTab key={doc.key} doc={doc} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
