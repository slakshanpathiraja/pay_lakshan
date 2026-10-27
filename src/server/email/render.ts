import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

// Fills a prebuilt template from ./templates (see its README): `{{name}}` HTML-escaped,
// `{{{name}}}` as is, `{{#name}}…{{/name}}` only when `name` has a value. The HTML body goes into layout.html; the .txt is the plain version.

const DIR = path.join(process.cwd(), "src", "server", "email", "templates");

/** The emails there are templates for. */
export type EmailTemplate =
  | "welcome"
  | "device-added"
  | "device-removed"
  | "order-created"
  | "order-updated"
  | "order-renewed";

const cache = new Map<string, string>();
/** Read once in production; every time in development so edits show up at once. */
function load(file: string) {
  const hit = cache.get(file);
  if (hit !== undefined) return hit;
  const text = readFileSync(path.join(DIR, file), "utf8");
  if (process.env.NODE_ENV === "production") cache.set(file, text);
  return text;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function fill(template: string, vars: Record<string, string>, html: boolean) {
  // {{#name}}…{{/name}}: kept only when `name` has a value
  const sections = template.replace(/\{\{#(\w+)\}\}\n?([\s\S]*?)\{\{\/\1\}\}\n?/g, (_, name: string, inner: string) =>
    vars[name] ? inner : "",
  );
  return sections.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, raw?: string, escaped?: string) =>
    raw ? (vars[raw] ?? "") : html ? escapeHtml(vars[escaped!] ?? "") : (vars[escaped!] ?? ""),
  );
}

export function renderEmail(name: EmailTemplate, vars: Record<string, string>) {
  const all: Record<string, string> = { year: String(new Date().getFullYear()), ...vars };
  const source = load(`${name}.html`);
  const head = source.match(/^\s*<!--\s*subject:\s*(.*?)\s*-->\s*/);
  if (!head) throw new Error(`Email template ${name}.html has no <!-- subject: … --> line`);
  // a header can't hold line breaks (they'd let a name add headers)
  const subject = fill(head[1], all, false).replace(/[\r\n]+/g, " ").trim();
  const content = fill(source.slice(head[0].length), all, true);
  return {
    subject,
    html: fill(load("layout.html"), { ...all, subject, preheader: all.preheader ?? subject, content }, true),
    text: fill(load(`${name}.txt`), all, false),
  };
}
