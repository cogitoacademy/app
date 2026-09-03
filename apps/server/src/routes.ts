import { timingSafeEqual } from "crypto";
import { createContext } from "@cogito-app/api/context";
import { appRouter } from "@cogito-app/api/routers";
import { rateLimit } from "@cogito-app/api/lib/rate-limit";
import type { RateLimitResult } from "@cogito-app/api/lib/rate-limit";
import { getRedisClient } from "@cogito-app/api/lib/redis";
import { SECURITY_HEADERS } from "@cogito-app/api/lib/security-headers";
import { MAX_UPLOAD_BYTES } from "@cogito-app/api/modules/upload/upload.types";
import { USER_ROLE } from "@cogito-app/api/shared/constants";
import { recordRequest, getMetrics } from "@cogito-app/api/lib/metrics";
import { auth, assertPasswordPolicy } from "@cogito-app/auth";
import { isAllowedFrontendOrigin } from "@cogito-app/env/origins";
import { env } from "@cogito-app/env/server";
import { matchAuthPath, matchRateLimitPath } from "./rate-limit-paths";
import { fetchProxyFile } from "./content-proxy";
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
import {
  generateRequestId,
  getClientIp,
  isValidUploadKey,
  openApiAccessDenied,
  readBodyWithLimit,
} from "@cogito-app/api/lib/request-id";
import { log as appLog } from "@cogito-app/api/lib/logger";
import { healthCheck, healthStatus } from "@cogito-app/api/lib/db-health";
import { parseSignupBody } from "./signup-body";

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
const inviteRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 10,
  keyPrefix: "invite",
  redis,
});
const bookingRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "booking",
  redis,
});
const searchRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "search",
  redis,
});
// M3: support ticket creation (SLA-driven abuse/lateness claims) — 5/min.
const supportRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 5,
  keyPrefix: "support",
  redis,
});
// M3: achievement submissions (moderation queue spam) — 30/min.
const achievementRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "achievement",
  redis,
});
// M3: upload URL creation (mints R2 presigned URLs) — 30/min.
const uploadRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "upload",
  redis,
});
// Content proxy: the Sanity file route streams real bytes (bandwidth) — 30/min.
const contentRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "content",
  redis,
});

const MAX_BODY_BYTES = 1024 * 1024;

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

// Correlates a Request with the authenticated user id so the consolidated
// per-request log line can carry userId without re-querying the session.
// Populated at the RPC / api-reference handler sites next to identifyUser.
const requestUserId = new WeakMap<Request, string>();

function logRpcError(
  error: unknown,
  options?: {
    request: {
      url: URL;
      headers: Record<string, string | string[] | undefined>;
      method: string;
    };
  },
) {
  const headerRequestId = options?.request.headers["x-request-id"];
  const requestId =
    typeof headerRequestId === "string" ? headerRequestId : generateRequestId();
  const path = options?.request.url.pathname ?? "/rpc";
  const method = options?.request.method ?? "POST";
  const common = { requestId, path, method };
  if (error instanceof ORPCError) {
    appLog({
      level: "warn",
      action: "rpc_error",
      ...common,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  } else {
    appLog({
      level: "error",
      action: "rpc_error",
      ...common,
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

/**
 * Builds the Elysia HTTP server with auth, RPC, OpenAPI, health, metrics, and webhook routes.
 *
 * @returns a configured Elysia instance with security headers, rate limits, and CORS applied
 */
export function createServer() {
  return (
    new Elysia()
      // Keep evlog's per-user identification available (context.log via
      // requestState) but suppress its per-request wide-event log line — the
      // consolidated request_complete line below carries method/path/status/
      // requestId/durationMs/userId. `exclude: ["**"]` makes shouldLog() false
      // for every path (evlog globs: `*` alone does not cross `/`), so the
      // plugin only wires up the logger, which identifyUser needs.
      .use(evlog({ exclude: ["**"] }))
      .derive(({ request }) => {
        const requestId =
          request.headers.get("x-request-id") || generateRequestId();
        const startTime = performance.now();
        return { requestId, startTime };
      })
      .onAfterHandle(({ requestId, startTime, request, set }) => {
        const durationMs = performance.now() - startTime;
        const path = new URL(request.url).pathname;
        recordRequest(path, durationMs);
        appLog({
          level: "info",
          requestId,
          action: "request_complete",
          durationMs,
          method: request.method,
          path,
          // Elysia's set.status may be a StatusText string literal; only the
          // numeric form (which defaults to 200) belongs in the log line.
          status: typeof set.status === "number" ? set.status : 200,
          userId: requestUserId.get(request),
        });
      })
      .onError(({ requestId, request, error }) => {
        const path = new URL(request.url).pathname;
        appLog({
          level: "error",
          requestId,
          action: "request_error",
          method: request.method,
          path,
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
      .onRequest(async ({ request, server }) => {
        const url = new URL(request.url);
        const path = url.pathname;
        const ip = getClientIp(request, env.TRUST_PROXY, server ?? undefined);

        if (matchAuthPath(path)) {
          const { allowed, retryAfterMs } = await authRateLimit(ip);
          if (!allowed) {
            return new Response(
              JSON.stringify({ error: "Too many requests" }),
              {
                status: 429,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
                },
              },
            );
          }
        }

        const rateLimitKind = matchRateLimitPath(path);
        let limiter: ((ip: string) => Promise<RateLimitResult>) | null = null;
        if (rateLimitKind === "payment") limiter = paymentRateLimit;
        else if (rateLimitKind === "invite") limiter = inviteRateLimit;
        else if (rateLimitKind === "booking") limiter = bookingRateLimit;
        else if (rateLimitKind === "search") limiter = searchRateLimit;
        else if (rateLimitKind === "support") limiter = supportRateLimit;
        else if (rateLimitKind === "achievement")
          limiter = achievementRateLimit;
        else if (rateLimitKind === "upload") limiter = uploadRateLimit;
        else if (rateLimitKind === "content") limiter = contentRateLimit;

        if (limiter) {
          const { allowed, retryAfterMs } = await limiter(ip);
          if (!allowed) {
            return new Response(
              JSON.stringify({ error: "Too many requests" }),
              {
                status: 429,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
                },
              },
            );
          }
        }
      })
      .all(
        "/api/auth/*",
        async (context) => {
          const { request, status } = context;
          if (["POST", "GET"].includes(request.method)) {
            if (request.method === "POST") {
              const { body, tooLarge } = await readBodyWithLimit(
                request,
                MAX_BODY_BYTES,
              );
              if (tooLarge) {
                return new Response(
                  JSON.stringify({ error: "Request body too large" }),
                  {
                    status: 413,
                    headers: { "Content-Type": "application/json" },
                  },
                );
              }
              // C6: enforce the password complexity policy at sign-up (the
              // server owns the body here — better-auth 1.6.11 has no built-in
              // complexity options or effective global-hook short-circuit).
              if (request.url.endsWith("/api/auth/sign-up/email")) {
                const parsed = parseSignupBody(body);
                if (!parsed) {
                  return status(400, { message: "Invalid JSON request body" });
                }
                const policyError = assertPasswordPolicy(parsed.password ?? "");
                if (policyError) {
                  return status(400, { message: policyError });
                }
              }
              const bounded = new Request(request.url, {
                method: request.method,
                headers: request.headers,
                body,
              });
              return auth.handler(bounded);
            }
            return auth.handler(request);
          }
          return status(405);
        },
        { parse: "none" },
      )
      .all(
        "/rpc*",
        async (context) => {
          const { body, tooLarge } = await readBodyWithLimit(
            context.request,
            MAX_BODY_BYTES,
          );
          if (tooLarge) {
            return new Response(
              JSON.stringify({ error: "Request body too large" }),
              {
                status: 413,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          const request = body
            ? new Request(context.request.url, {
                method: context.request.method,
                headers: context.request.headers,
                body,
              })
            : context.request;
          const ctx = await createContext({ context });
          if (ctx.session) {
            requestUserId.set(context.request, ctx.session.user.id);
            identifyUserFromSession(context.log, ctx.session, {
              maskEmail: true,
            });
          }
          const { response } = await rpcHandler.handle(request, {
            prefix: "/rpc",
            context: ctx,
          });
          return response ?? new Response("Not Found", { status: 404 });
        },
        { parse: "none" },
      )
      .get("/uploads/*", async ({ params, set }) => {
        if (env.R2_PUBLIC_URL) {
          set.status = 404;
          return { error: "Not found" };
        }
        const key = (params["*"] as string) ?? "";
        if (!isValidUploadKey(key)) {
          set.status = 404;
          return { error: "Not found" };
        }
        const file = Bun.file(`${env.UPLOAD_DIR}/${key}`);
        if (!(await file.exists())) {
          set.status = 404;
          return { error: "Not found" };
        }
        return new Response(file);
      })
      .get(
        "/content/knowledge-bank/:resourceId/file",
        async (routeContext) => {
          const { params, set } = routeContext;
          const context = await createContext({ context: routeContext });
          const sessionUser = context.session?.user as
            | { id: string; role?: string }
            | undefined;

          if (!sessionUser) {
            set.status = 401;
            return { error: "Unauthorized" };
          }
          const isStudent = sessionUser.role === USER_ROLE.STUDENT;
          const isTutor = sessionUser.role === USER_ROLE.TUTOR;
          const isAdmin = sessionUser.role === USER_ROLE.ADMIN;
          if (!isStudent && !isTutor && !isAdmin) {
            set.status = 403;
            return { error: "Forbidden" };
          }

          const access = await context.services.wallet.knowledgeBankEligible(
            sessionUser.id,
            sessionUser.role,
          );
          if (!access.eligible) {
            set.status = 403;
            return { error: "Knowledge Bank access requires 35 Marks" };
          }

          const file = await context.services.content.getStudentResourceFile(
            params.resourceId,
          );
          if (!file?.fileUrl) {
            set.status = 404;
            return { error: "Not found" };
          }

          // Hardened proxy: host allowlist (cdn.sanity.io / *.sanity.io), 10s
          // timeout, 5MB cap (content-length pre-check + streamed byte counter).
          const proxy = await fetchProxyFile(file.fileUrl);
          if (!proxy.ok) {
            set.status = proxy.reason;
            return { error: "Unable to retrieve resource" };
          }

          const filename =
            (file.fileName ?? "knowledge-bank-resource.pdf")
              .replace(/[^a-zA-Z0-9._-]/g, "_")
              .replace(/\.{2,}/g, ".")
              .replace(/^\.+/, "")
              .slice(0, 120) || "knowledge-bank-resource.pdf";

          return new Response(proxy.body, {
            headers: {
              "Content-Type": file.mimeType ?? "application/pdf",
              "Content-Disposition": `inline; filename="${filename}"`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        },
        { parse: "none" },
      )
      .post(
        "/uploads/*",
        async ({ params, set, request }) => {
          // Local-mode upload sink (dev only, when R2 is not configured). The
          // browser uploads to this authenticated, size-bounded route instead of a
          // presigned URL. Requires a session so uploads cannot be abused (M9).
          if (env.R2_PUBLIC_URL) {
            set.status = 404;
            return { error: "Not found" };
          }
          const key = (params["*"] as string) ?? "";
          if (!isValidUploadKey(key)) {
            set.status = 404;
            return { error: "Not found" };
          }
          const session = await auth.api.getSession({
            headers: request.headers,
          });
          if (!session?.user) {
            set.status = 401;
            return { error: "Unauthorized" };
          }
          if (!key.startsWith(`${session.user.id}/`)) {
            set.status = 403;
            return { error: "Forbidden" };
          }
          const { body, tooLarge } = await readBodyWithLimit(
            request,
            MAX_UPLOAD_BYTES,
          );
          if (tooLarge) {
            set.status = 413;
            return { error: "Request body too large" };
          }
          const filePath = `${env.UPLOAD_DIR}/${key}`;
          await Bun.write(filePath, body);
          return { ok: true, key };
        },
        { parse: "none" },
      )
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
        const status = healthStatus(result.status);
        // The deployed image sha (injected via the Dockerfile `ARG GIT_SHA` /
        // `ENV GIT_SHA`). The CD pipeline polls /health and requires
        // `version == <sha>` so a deploy is only green when the *new* image is
        // actually serving, not merely "some container is up". Falls back to
        // "dev" for local runs where GIT_SHA is unset.
        return Response.json(
          { ...result, version: process.env.GIT_SHA ?? "dev" },
          { status },
        );
      })
      .get("/metrics", ({ request }) => {
        if (!env.METRICS_TOKEN)
          return new Response("Not Found", { status: 404 });
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
      .use(paymentsWebhook)
  );
}
