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

/**
 * Reports the dead-letter queue depth (jobs whose attempts were exhausted).
 *
 * The DLQ is a bounded Redis list (`cogito:dlq`, max 100 entries, maintained
 * by the scheduler's DLQ worker). A non-zero depth means at least one job
 * failed permanently — holds may be unreleased, emails undelivered, meetings
 * un-created. This check lets Uptime Kuma alert on `dlqDepth > 0` (the
 * repeatable scheduler re-fires each job on its own cadence, so the DLQ is a
 * ledger, not a retry queue — no auto-replay).
 */
export async function checkDlqHealth(
  redis?: RedisClient,
  dlqKey = "cogito:dlq",
): Promise<number> {
  if (!redis) return 0;
  try {
    return await redis.llen(dlqKey);
  } catch {
    return -1; // unknown — Redis unreachable
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

  // Dead-letter queue depth — jobs that failed permanently. Surfaced for
  // alerting (`dlqDepth > 0` → Uptime Kuma) but deliberately EXCLUDED from
  // the overall status: the DLQ is a ledger, not a readiness gate, and a
  // non-zero depth must not trip the Coolify probe into a restart loop.
  const dlqDepth = await checkDlqHealth(redis);
  const dlqStatus: "ok" | "error" = dlqDepth === 0 ? "ok" : "error";

  // Readiness is computed from the service checks only (database, redis,
  // scheduler) — `dlq` is informational.
  const readiness = Object.values(checks);
  const overall: HealthOverall = readiness.every((v) => v === "ok")
    ? "ok"
    : readiness.some((v) => v === "error")
      ? "error"
      : "degraded";

  return {
    status: overall,
    checks: { ...checks, dlq: dlqStatus },
    dlqDepth,
    timestamp: new Date().toISOString(),
  };
}
