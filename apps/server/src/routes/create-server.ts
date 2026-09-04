import { Elysia } from "elysia";

import { paymentsWebhook } from "../webhooks/payments";
import {
  registerRequestLogging,
  registerCors,
  registerSecurityHeaders,
  requestBodyLimit,
} from "./middlewares";
import { registerRateLimits } from "./rate-limits";
import { registerAuthRoutes } from "./auth-routes";
import { registerRpcRoutes } from "./rpc-routes";
import { registerUploadRoutes } from "./upload-routes";
import { registerContentRoutes } from "./content-routes";
import { registerOpenApiRoutes } from "./openapi-routes";
import { registerHealthMetricsRoutes } from "./health-metrics";

/**
 * Builds the Elysia HTTP server with auth, RPC, OpenAPI, health, metrics,
 * and webhook routes.
 *
 * The read order IS the serve order: request logging → CORS → body limit →
 * rate limits → route plugins (auth, RPC, uploads, content, OpenAPI,
 * health/metrics) → payment webhooks.
 *
 * @returns a configured Elysia instance with security headers, rate limits, and CORS applied
 */
export function createServer() {
  return new Elysia()
    .use(registerRequestLogging)
    .use(registerCors)
    .use(registerSecurityHeaders)
    .onRequest(({ request }) => requestBodyLimit(request))
    .use(registerRateLimits)
    .use(registerAuthRoutes)
    .use(registerRpcRoutes)
    .use(registerUploadRoutes)
    .use(registerContentRoutes)
    .use(registerOpenApiRoutes)
    .use(registerHealthMetricsRoutes)
    .use(paymentsWebhook);
}
