import path from "node:path";
import config from "./playwright.class-enrollment.config";

const target = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.NODE_ENV !== "test" ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.port !== "6769" ||
  target.pathname !== "/cogito-test" ||
  process.env.T05_ENROLLMENT_TEST_DB_PORT !== "6769" ||
  process.env.T05_ENROLLMENT_TEST_REDIS_PORT !== "6381" ||
  process.env.T05_ENROLLMENT_TEST_SERVER_PORT !== "3201" ||
  process.env.T05_ENROLLMENT_TEST_WEB_PORT !== "3200" ||
  process.env.TEST_DATABASE_ALLOW_RESET ||
  process.env.TEST_DATABASE_RESET_TARGET
)
  throw new Error(
    "KB live acceptance requires the isolated T05 6769/6381/3201/3200 tuple without reset flags",
  );

const overrides = {
  KB_SOURCE: "database",
  CC_SOURCE: "database",
  CONTENT_ADMIN_ENABLED: "true",
  KB_PRIVATE_BUCKET: "",
  KB_PRIVATE_DIR: path.resolve(
    process.cwd(),
    "test-results/kb-calendar-live/private",
  ),
  SCHEDULER_ENABLED: "false",
  RESEND_API_KEY: "",
  PAYMENT_PROVIDER: "stub",
};
Object.assign(process.env, overrides);
if (!Array.isArray(config.webServer))
  throw new Error("Expected isolated test servers");
for (const server of config.webServer)
  server.env = { ...server.env, ...overrides };
config.testMatch = "**/kb-calendar-live.spec.ts";
config.use = {
  ...config.use,
  channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge",
};
export default config;
