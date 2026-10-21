import { COGITO_NS } from "@cogito-app/api/lib/redis";

const database = new URL(process.env.DATABASE_URL ?? "");
const redisTarget = new URL(process.env.REDIS_URL ?? "");
const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
const redisPorts = new Map([
  ["6767", "6379"],
  ["6768", "6380"],
  ["6769", "6381"],
]);
if (
  process.env.NODE_ENV !== "test" ||
  !["postgres:", "postgresql:"].includes(database.protocol) ||
  !loopback.has(database.hostname.replace(/^\[|\]$/g, "")) ||
  database.pathname !== "/cogito-test" ||
  redisTarget.protocol !== "redis:" ||
  !loopback.has(redisTarget.hostname.replace(/^\[|\]$/g, "")) ||
  !redisPorts.has(database.port) ||
  redisPorts.get(database.port) !== redisTarget.port
) {
  throw new Error(
    "Signup rate-limit reset requires the paired local test DB/Redis target.",
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
