import { db as defaultDb } from "@cogito-app/db";
import { sql } from "drizzle-orm";
import type { RedisClient } from "./redis";
import type { DbType } from "./db";

export type HealthOverall = "ok" | "degraded" | "error";

/**
 * Maps an overall health status to an HTTP status code (N3).
 *
 * `ok` → 200. `degraded` and `error` both → 503 so that a latency-degraded
 * dependency (>1s) trips the LB / Coolify readiness check instead of being
 * silently reported healthy. Previously `degraded` mapped to 200, so a
 * slow-but-alive DB/Redis was indistinguishable from fully healthy.
 */
export function healthStatus(status: HealthOverall): number {
  return status === "ok" ? 200 : 503;
}

export async function healthCheck(redis?: RedisClient, db: DbType = defaultDb) {
  const checks: Record<string, "ok" | "degraded" | "error"> = {};

  try {
    const start = performance.now();
    await db.execute(sql`SELECT 1`);
    const durationMs = performance.now() - start;
    checks.database = durationMs < 1000 ? "ok" : "degraded";
  } catch {
    checks.database = "error";
  }

  if (redis) {
    try {
      const start = performance.now();
      await redis.ping();
      const durationMs = performance.now() - start;
      checks.redis = durationMs < 1000 ? "ok" : "degraded";
    } catch {
      checks.redis = "error";
    }
  }

  const overall: HealthOverall = Object.values(checks).every(
    (v) => v === "ok",
  )
    ? "ok"
    : Object.values(checks).some((v) => v === "error")
      ? "error"
      : "degraded";

  return { status: overall, checks, timestamp: new Date().toISOString() };
}
