import { execFileSync } from "node:child_process";
import path from "node:path";
import { resolveE2eEnvFile } from "./e2e-environment";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const AUTH_RATE_LIMIT_TARGETS = new Map([
  ["6769:/cogito-test", "6381"],
  ["6770:/cogito-test-payout", "6382"],
]);

function isLoopback(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase().replace(/^\[|\]$/g, ""));
}

/**
 * Clear auth limiter keys before a seeded browser sign-in when the workflow
 * explicitly opts in. This keeps retries isolated without changing the
 * production limit or making rate-limit behavior part of these UI journeys.
 */
export function resetE2eAuthRateLimit() {
  if (process.env.E2E_AUTH_RATE_LIMIT_RESET !== "true") return;

  let databaseUrl: URL;
  let redisUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL ?? "");
    redisUrl = new URL(process.env.REDIS_URL ?? "");
  } catch {
    throw new Error(
      "Auth rate-limit reset requires an exact disposable loopback database and Redis target.",
    );
  }

  const databaseTarget = `${databaseUrl.port}:${databaseUrl.pathname}`;
  const expectedRedisPort = AUTH_RATE_LIMIT_TARGETS.get(databaseTarget);
  if (
    process.env.NODE_ENV !== "test" ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !isLoopback(databaseUrl.hostname) ||
    databaseUrl.search !== "" ||
    databaseUrl.hash !== "" ||
    redisUrl.protocol !== "redis:" ||
    !isLoopback(redisUrl.hostname) ||
    redisUrl.port !== expectedRedisPort ||
    redisUrl.pathname !== "" ||
    redisUrl.search !== "" ||
    redisUrl.hash !== ""
  ) {
    throw new Error(
      "Auth rate-limit reset requires exact 6769/cogito-test + 6381 or 6770/cogito-test-payout + 6382 targets.",
    );
  }

  const selectedEnvFile = resolveE2eEnvFile(process.cwd(), process.env);
  execFileSync(
    "bun",
    [
      `--env-file=${selectedEnvFile}`,
      "run",
      "src/seed/reset-e2e-signup-rate-limit.ts",
    ],
    {
      cwd: path.resolve(process.cwd(), "../../apps/server"),
      env: process.env,
      stdio: "pipe",
      timeout: 10_000,
    },
  );
}
