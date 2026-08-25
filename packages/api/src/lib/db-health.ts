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

/**
 * Reports scheduler readiness from the shared Redis connection.
 *
 * `ok` when Redis answers `PING`; `error` when it throws (the scheduler's
 * BullMQ queues and workers depend on Redis, so an unreachable Redis means the
 * booking-expiry/hold-release/email/SLA jobs are not running); `degraded` when
 * no Redis client is available at all (defensive in-memory fallback path).
 */
export async function checkSchedulerHealth(
  redis?: RedisClient,
): Promise<"ok" | "degraded" | "error"> {
  if (!redis) return "degraded";
  try {
    await redis.ping();
    return "ok";
  } catch {
    return "error";
  }
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

  // The scheduler runs on the same shared Redis; surface its health so a
  // dead scheduler (no expiry/hold-release/email jobs) trips the LB check.
  // Omitted when no Redis client is available (defensive fallback path).
  if (redis) {
    checks.scheduler = await checkSchedulerHealth(redis);
  }

  const overall: HealthOverall = Object.values(checks).every((v) => v === "ok")
    ? "ok"
    : Object.values(checks).some((v) => v === "error")
      ? "error"
      : "degraded";

  return { status: overall, checks, timestamp: new Date().toISOString() };
}
