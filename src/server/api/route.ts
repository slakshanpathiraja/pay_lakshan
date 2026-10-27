import "server-only";
import { after } from "next/server";
import type { z, ZodType } from "zod";
import { canUseEndpoint } from "../access";
import { processWebhookOutbox } from "../app-webhooks";
import { processEmailOutbox } from "../email/outbox";
import { ApiError, handler, parseBody, requireUser } from "../http";
import { PLATFORM_HEADER, resolveScope, type Scope } from "../scope";
import type { UserRow } from "../users";
import { endpoints, type EndpointId } from "./endpoints";

type Def<Id extends EndpointId> = (typeof endpoints)[Id];
type Parsed<D, K extends string> =
  D extends Record<K, infer S extends ZodType> ? z.output<S> : undefined;

export interface RouteContext<Id extends EndpointId> {
  req: Request;
  params: Parsed<Def<Id>, "params">;
  query: Parsed<Def<Id>, "query">;
  body: Parsed<Def<Id>, "body">;
  /** the signed-in user; null on public endpoints */
  user: Def<Id>["access"] extends "public" ? null : UserRow;
  /** platform (+ app) the request works on — only on endpoints with `scope: true` */
  scope: Def<Id> extends { scope: true } ? Scope : undefined;
}

function validationError(error: z.ZodError) {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

/**
 * Wraps a route handler with its catalog definition: checks the HTTP method, enforces
 * access (sign-in, role permission or super admin), and validates path params, query
 * string and JSON body. Handlers receive typed, already-validated input.
 * Endpoints with `scope: true` also get their platform (the active one) and app resolved
 * and checked (see scope.ts) — handlers must only touch rows of `scope.platformId`.
 * After a request that may change something (not GET), queued emails are sent — once the
 * response is out, so mail never slows a request down.
 */
export function route<Id extends EndpointId>(
  id: Id,
  fn: (ctx: RouteContext<Id>) => Promise<Response>,
) {
  const def = endpoints[id] as Def<Id> & {
    params?: ZodType;
    query?: ZodType;
    body?: ZodType;
  };

  return handler(
    async (
      req: Request,
      ctx: { params?: Promise<Record<string, string | string[]>> },
    ) => {
      if (req.method !== def.method)
        throw new ApiError(405, "METHOD_NOT_ALLOWED");
      if (req.method !== "GET") {
        after(() => processEmailOutbox().catch((err) => console.error("[email] outbox", err)));
        after(() => processWebhookOutbox().catch((err) => console.error("[app webhooks] outbox", err)));
      }

      let user: UserRow | null = null;
      switch (def.access) {
        case "public":
          break;
        case "pending":
          user = await requireUser({ allowPendingPasswordChange: true });
          break;
        case "authenticated":
          user = await requireUser();
          break;
        case "permission":
          user = await requireUser();
          if (!(await canUseEndpoint(user, id)))
            throw new ApiError(403, "FORBIDDEN");
          break;
      }

      let params: unknown;
      if (def.params) {
        const parsed = def.params.safeParse((await ctx.params) ?? {});
        if (!parsed.success) throw validationError(parsed.error);
        params = parsed.data;
      }

      let query: unknown;
      if (def.query) {
        const parsed = def.query.safeParse(
          Object.fromEntries(new URL(req.url).searchParams),
        );
        if (!parsed.success) throw validationError(parsed.error);
        query = parsed.data;
      }

      const body = def.body ? await parseBody(req, def.body) : undefined;

      let scope: Scope | undefined;
      if ("scope" in def && def.scope) {
        const input = { ...(query as object), ...(body as object) } as {
          appId?: unknown;
        };
        scope = await resolveScope(
          user!,
          input,
          req.headers.get(PLATFORM_HEADER),
        );
      }

      return fn({ req, params, query, body, user, scope } as RouteContext<Id>);
    },
  );
}
