import { timingSafeEqual } from "crypto";
import { getRedisClient } from "@cogito-app/api/lib/redis";
import {
  checkCircuitBreakers,
  checkDlqHealth,
  healthCheck,
  healthStatus,
} from "@cogito-app/api/lib/db-health";
import { renderExposition } from "@cogito-app/api/lib/metrics";
import { env } from "@cogito-app/env/server";
import type { Elysia } from "elysia";

/**
 * /health + /metrics — the readiness probe (DB/Redis/scheduler/DLQ + deployed
 * image sha for the CD pipeline) and the token-gated metrics endpoint.
 */
export function registerHealthMetricsRoutes(app: Elysia) {
  return app
    .get("/health", async () => {
      const redis = getRedisClient();
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
    .get("/metrics", async ({ request }) => {
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
      // P1: Prometheus text exposition (version 0.0.4). Counter/histogram
      // series come from the in-process `recordRequest` telemetry; the gauges
      // are read from the shared Redis (fresh DLQ depth, -1 when unknown, and
      // per-breaker states). Bearer gating above is unchanged.
      const redis = getRedisClient();
      const dlqDepth = await checkDlqHealth(redis);
      const breakers = await checkCircuitBreakers(redis);
      return new Response(renderExposition({ dlqDepth, breakers }), {
        status: 200,
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    })
    .get("/", () => "OK");
}
