import { db } from "@cogito-app/db";
import { sql } from "drizzle-orm";
import type { RedisClient } from "./redis";

export async function healthCheck(redis?: RedisClient) {
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

  const overall = Object.values(checks).every((v) => v === "ok")
    ? "ok"
    : Object.values(checks).some((v) => v === "error")
      ? "error"
      : "degraded";

  return { status: overall, checks, timestamp: new Date().toISOString() };
}
