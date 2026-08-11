import { timingSafeEqual } from "crypto";
import { createContext } from "@cogito-app/api/context";
import { appRouter } from "@cogito-app/api/routers";
import { rateLimit } from "@cogito-app/api/lib/rate-limit";
import { getRedisClient } from "@cogito-app/api/lib/redis";
import { SECURITY_HEADERS } from "@cogito-app/api/lib/security-headers";
import { recordRequest, getMetrics } from "@cogito-app/api/lib/metrics";
import { auth } from "@cogito-app/auth";
import { isAllowedFrontendOrigin } from "@cogito-app/env/origins";
import { env } from "@cogito-app/env/server";
import { cors } from "@elysiajs/cors";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Elysia } from "elysia";

import { paymentsWebhook } from "./webhooks/payments";
import { evlog } from "evlog/elysia";

import { identifyUser as identifyUserFromSession } from "evlog/better-auth";
import { enrichOpenAPISpec, openApiTags, scalarHtml } from "./openapi";
import { generateRequestId } from "@cogito-app/api/lib/request-id";
import { log as appLog } from "@cogito-app/api/lib/logger";
import { healthCheck } from "@cogito-app/api/lib/db-health";

const redis = getRedisClient();

const authRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 10,
  keyPrefix: "auth",
  redis,
});
const paymentRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 5,
  keyPrefix: "payment",
  redis,
});

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

function logRpcError(error: unknown) {
  if (error instanceof ORPCError) {
    appLog({
      level: "warn",
      action: "rpc_error",
      error: {
        code: error.code,
        message: error.message,
      },
    });
  } else {
    appLog({
      level: "error",
      action: "rpc_error",
      error: {
        message: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...(error instanceof Error && error.cause
          ? { cause: String(error.cause) }
          : {}),
      },
    });
  }
}

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [onError(logRpcError)],
});

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

export function createServer() {
  return new Elysia()
    .use(evlog())
    .derive(({ request }) => {
      const requestId =
        request.headers.get("x-request-id") || generateRequestId();
      const startTime = performance.now();
      return { requestId, startTime };
    })
    .onAfterHandle(({ requestId, startTime, request }) => {
      const durationMs = performance.now() - startTime;
      const path = new URL(request.url).pathname;
      recordRequest(path, durationMs);
      appLog({
        level: "info",
        requestId,
        action: "request_complete",
        durationMs,
      });
    })
    .onError(({ requestId, error }) => {
      appLog({
        level: "error",
        requestId,
        action: "request_error",
        error: {
          message: String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    })
    .onRequest(({ set }) => {
      for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
        set.headers[header] = value;
      }
    })

    .use(
      cors({
        origin: (request) =>
          isAllowedFrontendOrigin(
            request.headers.get("origin"),
            env.CORS_ORIGIN,
            env.NODE_ENV,
          ),
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
      }),
    )
    .onRequest(({ request }) => {
      const isWebhook = request.url.includes("/webhooks/");
      const limit = isWebhook ? MAX_WEBHOOK_BODY_BYTES : MAX_BODY_BYTES;
      const contentLength = request.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > limit) {
        return new Response(
          JSON.stringify({ error: "Request body too large" }),
          {
            status: 413,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    })
    .onRequest(async ({ request }) => {
      const url = new URL(request.url);
      const path = url.pathname;
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown";

      if (path.startsWith("/rpc/auth.")) {
        const { allowed, retryAfterMs } = await authRateLimit(ip);
        if (!allowed) {
          return new Response(JSON.stringify({ error: "Too many requests" }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
            },
          });
        }
      }

      if (path === "/rpc/payment.createIntent") {
        const { allowed, retryAfterMs } = await paymentRateLimit(ip);
        if (!allowed) {
          return new Response(JSON.stringify({ error: "Too many requests" }), {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
            },
          });
        }
      }
    })
    .all("/api/auth/*", async (context) => {
      const { request, status } = context;
      if (["POST", "GET"].includes(request.method)) {
        return auth.handler(request);
      }
      return status(405);
    })
    .all(
      "/rpc*",
      async (context) => {
        const ctx = await createContext({ context });
        if (ctx.session) {
          identifyUserFromSession(context.log, ctx.session, {
            maskEmail: true,
          });
        }
        const { response } = await rpcHandler.handle(context.request, {
          prefix: "/rpc",
          context: ctx,
        });
        return response ?? new Response("Not Found", { status: 404 });
      },
      { parse: "none" },
    )
    .get("/openapi.json", async ({ request }) => {
      if (env.NODE_ENV === "production")
        return new Response("Not Found", { status: 404 });
      return Response.json(await generateOpenAPISpec(request));
    })
    .get("/api-reference", () => {
      if (env.NODE_ENV === "production")
        return new Response("Not Found", { status: 404 });
      return new Response(scalarHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    })
    .all(
      "/api-reference*",
      async (context) => {
        const ctx = await createContext({ context });
        if (ctx.session) {
          identifyUserFromSession(context.log, ctx.session, {
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
    )
    .get("/health", async () => {
      const result = await healthCheck(redis);
      const status =
        result.status === "ok" ? 200 : result.status === "degraded" ? 200 : 503;
      return Response.json(result, { status });
    })
    .get("/metrics", ({ request }) => {
      if (!env.METRICS_TOKEN) return new Response("Not Found", { status: 404 });
      const authHeader = request.headers.get("authorization") ?? "";
      const expected = `Bearer ${env.METRICS_TOKEN}`;
      if (
        authHeader.length !== expected.length ||
        !timingSafeEqual(
          new TextEncoder().encode(authHeader),
          new TextEncoder().encode(expected),
        )
      ) {
        return new Response("Unauthorized", { status: 401 });
      }
      return Response.json(getMetrics());
    })
    .get("/", () => "OK")
    .use(paymentsWebhook);
}
