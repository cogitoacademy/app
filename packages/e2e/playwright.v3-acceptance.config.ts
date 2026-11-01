import config from "./playwright.booking-admin-reports.config";

const database = new URL(process.env.DATABASE_URL ?? "");
const redis = new URL(process.env.REDIS_URL ?? "");
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (
  !loopback.has(database.hostname) ||
  database.port !== "6769" ||
  database.pathname !== "/cogito-test" ||
  !loopback.has(redis.hostname) ||
  redis.protocol !== "redis:" ||
  redis.port !== "6381" ||
  process.env.T05_ENROLLMENT_TEST_DB_PORT !== "6769" ||
  process.env.T05_ENROLLMENT_TEST_REDIS_PORT !== "6381" ||
  process.env.T05_ENROLLMENT_TEST_SERVER_PORT !== "3201" ||
  process.env.T05_ENROLLMENT_TEST_WEB_PORT !== "3200" ||
  process.env.TEST_DATABASE_ALLOW_RESET ||
  process.env.TEST_DATABASE_RESET_TARGET
)
  throw new Error(
    "V3 acceptance requires the non-reset T05 6769/6381/3201/3200 environment",
  );

const flags = {
  T06_CLASS_LIFECYCLE_E2E: "1",
  T07_CLASS_REPORTS_E2E: "1",
  T07_ON_DEMAND_BOOKING_REPORTS_E2E: "1",
  E2E_AUTH_RATE_LIMIT_RESET: "true",
  SCHEDULER_ENABLED: "false",
  RESEND_API_KEY: "",
  PAYMENT_PROVIDER: "stub",
};
Object.assign(process.env, flags);
if (!Array.isArray(config.webServer))
  throw new Error("Expected isolated test servers");
for (const server of config.webServer) server.env = { ...server.env, ...flags };
config.testMatch = [
  "**/booking-flow.spec.ts",
  "**/academy-class-publish.spec.ts",
  "**/class-enrollment.spec.ts",
  "**/class-reports.spec.ts",
  "**/booking-admin-reports.spec.ts",
];
if (process.env.E2E_BROWSER_CHANNEL) {
  config.use = { ...config.use, channel: process.env.E2E_BROWSER_CHANNEL };
}
export default config;
