import { auth } from "@cogito-app/auth";
import { env } from "@cogito-app/env/server";
import { openApiAccessDenied } from "@cogito-app/api/lib/request-id";
import { createContext } from "@cogito-app/api/context";
import { appRouter } from "@cogito-app/api/routers";
import { onError } from "@orpc/server";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { identifyUser as identifyUserFromSession } from "evlog/better-auth";
import { useLogger } from "evlog/elysia";
import { enrichOpenAPISpec, openApiTags, scalarHtml } from "../openapi";
import { logRpcError } from "./rpc-routes";
import { requestUserId } from "./middlewares";
import type { Elysia } from "elysia";

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

async function generateOpenAPISpec(request: Request) {
  const url = new URL(request.url);
  const spec = await openAPIGenerator.generate(appRouter, {
    info: {
      title: "Cogito API",
      version: "1.0.0",
    },
    servers: [{ url: `${url.protocol}//${url.host}/api-reference` }],
    tags: openApiTags,
  });

  return enrichOpenAPISpec(spec);
}

const apiHandler = new OpenAPIHandler(appRouter, {
  interceptors: [onError(logRpcError)],
});

/**
 * /openapi.json + /api-reference — the OpenAPI spec and Scalar UI, both
 * gated by the same session check (spec is auth-gated outside production).
 */
export function registerOpenApiRoutes(app: Elysia) {
  return app
    .get("/openapi.json", async ({ request }) => {
      const session = await auth.api.getSession({
        headers: request.headers,
      });
      const denied = openApiAccessDenied(env.NODE_ENV, !!session);
      if (denied) return denied;
      return Response.json(await generateOpenAPISpec(request));
    })
    .get("/api-reference", async ({ request }) => {
      const session = await auth.api.getSession({
        headers: request.headers,
      });
      const denied = openApiAccessDenied(env.NODE_ENV, !!session);
      if (denied) return denied;
      return new Response(scalarHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    })
    .all(
      "/api-reference*",
      async (context) => {
        const session = await auth.api.getSession({
          headers: context.request.headers,
        });
        const denied = openApiAccessDenied(env.NODE_ENV, !!session);
        if (denied) return denied;
        const ctx = await createContext({ context });
        if (ctx.session) {
          requestUserId.set(context.request, ctx.session.user.id);
          identifyUserFromSession(useLogger(), ctx.session, {
            maskEmail: true,
          });
        }
        const { response } = await apiHandler.handle(context.request, {
          prefix: "/api-reference",
          context: ctx,
        });
        return response ?? new Response("Not Found", { status: 404 });
      },
      { parse: "none" },
    );
}
