import { db as defaultDb } from "@cogito-app/db";
import { sql } from "drizzle-orm";
import { InMemoryRedis, type RedisClient } from "./redis";
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
 * Freshness window for DLQ depth reporting.
 *
 * Default: 24 hours in milliseconds. Overridable via the
 * `DLQ_FRESH_WINDOW_HOURS` env var (plain integer parse — ops flexibility,
 * no env-schema requirement). An invalid value (non-numeric, <= 0, or above
 * the one-year sanity cap) falls back to the 24h default. The window is
 * resolved at call time (not module load) so tests and runtime env changes
 * take effect immediately.
 */
export const DLQ_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

// Upper bound for the Lua scan. The DLQ list is kept LTRIM-bounded to
// DLQ_LIST_MAX (100) by the scheduler's DLQ worker, so this bounded read can
// never walk an unbounded list even if the bound were misconfigured.
const DLQ_LIST_SCAN_MAX = 100;

const DLQ_FRESH_WINDOW_MAX_HOURS = 24 * 365;

function resolveDlqFreshWindowMs(
  env: Record<string, string | undefined>,
): number {
  const raw = env.DLQ_FRESH_WINDOW_HOURS;
  if (raw === undefined || raw.trim() === "") return DLQ_FRESH_WINDOW_MS;
  const hours = Number.parseInt(raw, 10);
  if (Number.isNaN(hours) || hours <= 0 || hours > DLQ_FRESH_WINDOW_MAX_HOURS) {
    return DLQ_FRESH_WINDOW_MS;
  }
  return hours * 60 * 60 * 1000;
}

/**
 * Lua scan for the DLQ freshness count.
 *
 * KEYS[1] = DLQ list key; ARGV[1] = freshness cutoff (epoch ms as string);
 * ARGV[2] = list upper bound (list is LTRIM-bounded, bounded read anyway).
 *
 * Fresh = an entry whose JSON `failedAt` (epoch ms) is strictly greater than
 * the cutoff. **Entries without a parseable `failedAt` — including the
 * pre-2026-08-31 ledger pushed before timestamps existed and any non-JSON
 * payload — are treated as STALE and never count toward the fresh depth** so
 * an old ledger can no longer trip the alert forever. Returns the fresh
 * count (a Lua number). Computed atomically server-side: one round-trip, no
 * LRANGE traffic to the app.
 */
const DLQ_FRESH_DEPTH_LUA = `
local depth = 0
local items = redis.call('LRANGE', KEYS[1], 0, ARGV[2] - 1)
local cutoff = tonumber(ARGV[1])
for _, item in ipairs(items) do
  local ok, entry = pcall(cjson.decode, item)
  if ok and type(entry) == 'table' and entry.failedAt ~= nil and type(entry.failedAt) == 'number' and entry.failedAt > cutoff then
    depth = depth + 1
  end
end
return depth
`;

/**
 * Reports the *fresh* dead-letter queue depth (jobs whose attempts were
 * exhausted **within the freshness window**).
 *
 * The DLQ is a bounded Redis list (`cogito:dlq`, max 100 entries, no TTL —
 * a permanent ledger) maintained by the scheduler's DLQ worker since the
 * 2026-08-31 change stamps each entry with `failedAt` (epoch ms). Depth is
 * the count of entries whose `failedAt` is within `DLQ_FRESH_WINDOW_MS`
 * (default 24h; `DLQ_FRESH_WINDOW_HOURS` env override), computed atomically
 * in Lua. **Entries without `failedAt` (the pre-timestamp ledger, e.g. the
 * 2026-08-25 batch) are treated as STALE and never count** — alert hygiene,
 * not data loss: the full ledger remains in Redis for inspection and
 * `ops.sh dlq`/`dlq-clear`. This lets Uptime Kuma alert on `dlqDepth > 0`
 * for *new* permanent failures without a stale ledger tripping the alert
 * forever (the repeatable scheduler re-fires each job on its own cadence, so
 * the DLQ is a ledger, not a retry queue — no auto-replay). Returns `-1`
 * when the depth cannot be determined (Redis unreachable).
 */
export async function checkDlqHealth(
  redis?: RedisClient,
  dlqKey = "cogito:dlq",
): Promise<number> {
  if (!redis) return 0;
  // The in-memory fallback store keeps no DLQ list (its `eval` is
  // unsupported), so its fresh depth is genuinely 0 — return before the
  // eval-based path would turn that into a spurious `-1`.
  if (redis instanceof InMemoryRedis) return 0;
  try {
    const cutoffMs = Date.now() - resolveDlqFreshWindowMs(process.env);
    return (await redis.eval(
      DLQ_FRESH_DEPTH_LUA,
      [dlqKey],
      [String(cutoffMs), String(DLQ_LIST_SCAN_MAX)],
    )) as number;
  } catch {
    return -1; // unknown — Redis unreachable
  }
}

/**
 * Reports the state of every Redis-backed circuit breaker (Resend, Google
 * Meet, Xendit). Reads the `cogito:cb:*` HSET keys; a missing key means the
 * breaker has never tripped (closed). Informational only — never flips the
 * overall health status (mirrors `dlq`): an open breaker means the app is
 * deliberately failing fast, not that the instance cannot serve.
 */
export async function checkCircuitBreakers(
  redis?: RedisClient,
): Promise<Record<string, "closed" | "open" | "half-open">> {
  if (!redis) return {};
  try {
    const keys = await redis.keys("cogito:cb:*");
    const result: Record<string, "closed" | "open" | "half-open"> = {};
    for (const key of keys) {
      const name = key.replace(/^cogito:cb:/, "");
      const state = (await redis.hget(key, "state")) ?? "closed";
      if (state === "open" || state === "half-open" || state === "closed") {
        result[name] = state;
      }
    }
    return result;
  } catch {
    return {};
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

  // Dead-letter queue depth — jobs that failed permanently within the
  // freshness window (stale ledger entries don't count; see
  // checkDlqHealth). Surfaced for alerting (`dlqDepth > 0` → Uptime Kuma)
  // but deliberately EXCLUDED from the overall status: the DLQ is a ledger,
  // not a readiness gate, and a non-zero depth must not trip the Coolify
  // probe into a restart loop.
  const dlqDepth = await checkDlqHealth(redis);
  const dlqStatus: "ok" | "error" = dlqDepth === 0 ? "ok" : "error";

  // Circuit-breaker states (Resend / Google Meet / Xendit) — informational
  // only, like `dlq`: an open breaker is the app deliberately failing fast,
  // not a readiness failure, so it must never flip the overall status.
  const circuitBreakers = await checkCircuitBreakers(redis);

  // Readiness is computed from the service checks only (database, redis,
  // scheduler) — `dlq` and `circuitBreakers` are informational.
  const readiness = Object.values(checks);
  const overall: HealthOverall = readiness.every((v) => v === "ok")
    ? "ok"
    : readiness.some((v) => v === "error")
      ? "error"
      : "degraded";

  return {
    status: overall,
    checks: { ...checks, dlq: dlqStatus, circuitBreakers },
    dlqDepth,
    timestamp: new Date().toISOString(),
  };
}
