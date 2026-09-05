import { SECURITY_HEADERS } from "@cogito-app/api/lib/security-headers";
import { recordRequest } from "@cogito-app/api/lib/metrics";
import { log as appLog } from "@cogito-app/api/lib/logger";
import { generateRequestId } from "@cogito-app/api/lib/request-id";
import {
  enterTrace,
  getTrace,
  parseTraceparent,
} from "@cogito-app/api/lib/trace";
import { isAllowedFrontendOrigin } from "@cogito-app/env/origins";
import { env } from "@cogito-app/env/server";
import { cors } from "@elysiajs/cors";
import { evlog } from "evlog/elysia";
import type { Elysia } from "elysia";

/**
 * The Elysia app type after the evlog plugin is applied — carries the
 * `derive: { log }` augmentation so route plugins can use `context.log`
 * (the documented request-scoped accessor) with full typing. Route plugins
 * should accept and return this type.
 */
export type EvlogApp = ReturnType<typeof evlog>;

export const MAX_BODY_BYTES = 1024 * 1024;

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

// Correlates a Request with the authenticated user id so the consolidated
// per-request log line can carry userId without re-querying the session.
// Populated at the RPC / api-reference handler sites next to identifyUser.
export const requestUserId = new WeakMap<Request, string>();

export function bodyLimitResponse(): Response {
  return new Response(JSON.stringify({ error: "Request body too large" }), {
    status: 413,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Rejects requests whose declared content-length exceeds the per-route limit
 * (webhooks get a larger budget than the JSON API). Returns null when the
 * request is within bounds.
 */
export function requestBodyLimit(request: Request): Response | null {
  const isWebhook = request.url.includes("/webhooks/");
  const limit = isWebhook ? MAX_WEBHOOK_BODY_BYTES : MAX_BODY_BYTES;
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > limit) {
    return bodyLimitResponse();
  }
  return null;
}

/**
 * Wires the per-request observability pipeline: evlog's logger (per-user
 * identification available via context.log, per-request wide-event line
 * suppressed — the consolidated request_complete line below carries
 * method/path/status/requestId/durationMs/userId), request-id derivation,
 * the consolidated request_complete log, and the request_error log.
 */
export function registerRequestLogging(app: Elysia) {
  return (
    app
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
        // T1: seed the trace scope per request — incoming W3C `traceparent`
        // wins, then `x-request-id`, then a generated `req_*` id (which also
        // becomes the traceId so every request is correlatable in Loki).
        const traceparent = request.headers.get("traceparent");
        const parsed = traceparent ? parseTraceparent(traceparent) : null;
        const traceId =
          parsed?.traceId || request.headers.get("x-request-id") || requestId;
        enterTrace({ traceId });
        const startTime = performance.now();
        return { requestId, startTime, traceId };
      })
      .onAfterHandle(({ requestId, traceId, startTime, request, set }) => {
        const durationMs = performance.now() - startTime;
        const path = new URL(request.url).pathname;
        recordRequest(
          path,
          durationMs,
          request.method,
          typeof set.status === "number" ? set.status : 200,
        );
        appLog({
          level: "info",
          requestId,
          traceId: getTrace()?.traceId ?? traceId,
          action: "request_complete",
          durationMs,
          method: request.method,
          path,
          // Elysia's set.status may be a StatusText string literal; only the
          // numeric form (which defaults to 200) belongs in the log line.
          status: typeof set.status === "number" ? set.status : 200,
          userId: requestUserId.get(request) ?? getTrace()?.userId,
        });
      })
      .onError(({ requestId, request, error }) => {
        const path = new URL(request.url).pathname;
        appLog({
          level: "error",
          requestId,
          traceId: getTrace()?.traceId,
          action: "request_error",
          method: request.method,
          path,
          userId: requestUserId.get(request) ?? getTrace()?.userId,
          error: {
            message: String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      })
  );
}

export function registerCors(app: Elysia) {
  return app.use(
    cors({
      origin: (request) =>
        isAllowedFrontendOrigin(
          request.headers.get("origin"),
          env.CORS_ORIGIN,
          env.NODE_ENV,
        ),
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "traceparent",
        "x-request-id",
      ],
      credentials: true,
    }),
  );
}

export function registerSecurityHeaders(app: Elysia) {
  return app.onRequest(({ set }) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      set.headers[header] = value;
    }
  });
}
