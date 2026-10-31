import { COGITO_NS } from "@cogito-app/api/lib/redis";

const database = new URL(process.env.DATABASE_URL ?? "");
const redisTarget = new URL(process.env.REDIS_URL ?? "");
const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
const redisPorts = new Map([
  ["6769", "6381"],
  ["6770", "6382"],
]);
const databaseNames = new Map([
  ["6769", "/cogito-test"],
  ["6770", "/cogito-test-payout"],
]);
if (
  process.env.E2E_AUTH_RATE_LIMIT_RESET !== "true" ||
  process.env.NODE_ENV !== "test" ||
  !["postgres:", "postgresql:"].includes(database.protocol) ||
  !loopback.has(database.hostname.replace(/^\[|\]$/g, "")) ||
  database.pathname !== databaseNames.get(database.port) ||
  database.search !== "" ||
  database.hash !== "" ||
  redisTarget.protocol !== "redis:" ||
  !loopback.has(redisTarget.hostname.replace(/^\[|\]$/g, "")) ||
  redisTarget.pathname !== "" ||
  redisTarget.search !== "" ||
  redisTarget.hash !== "" ||
  !redisPorts.has(database.port) ||
  redisPorts.get(database.port) !== redisTarget.port
) {
  throw new Error(
    "Auth rate-limit reset requires explicit consent and the exact disposable loopback DB/Redis pair.",
  );
}

const redis = new Bun.RedisClient(redisTarget.toString());
try {
  const keys = await redis.send("KEYS", [`${COGITO_NS.RATE_LIMIT}:auth:*`]);
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) {
    throw new Error("Unexpected auth rate-limit key response");
  }
  if (keys.length > 0) await redis.send("DEL", keys);
} finally {
  redis.close();
}
