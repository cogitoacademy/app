import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";
import {
  resolveE2eEnvironment,
  resolveE2eEnvFile,
} from "./src/fixtures/e2e-environment";

/**
 * E2E tests run against the local dev stack.
 *
 * Required environment:
 *   - DATABASE_URL pointing at the local Postgres container
 *   - SERVER_URL=http://localhost:3101
 *   - WEB_URL=http://localhost:3100
 *
 * Playwright starts fresh API and web dev servers, then seeds the dedicated
 * test database before the test run.
 */
const resolvedEnvFile = resolveE2eEnvFile(process.cwd(), process.env);
// Preserve ambient values so the guard rejects unsafe database overrides.
const envLoadResult = dotenv.config({ path: resolvedEnvFile, override: false });
if (envLoadResult.error) {
  throw new Error("E2E environment file could not be loaded.");
}
// Keep later setup on the same resolved file, even if dotenv defines ENV_FILE.
process.env.ENV_FILE = resolvedEnvFile;
const e2eEnvironment = resolveE2eEnvironment(process.env);
const webUrl = e2eEnvironment.webUrl;
const serverUrl = e2eEnvironment.serverUrl;
const serverCwd = path.resolve(process.cwd(), "../../apps/server");
const webCwd = path.resolve(process.cwd(), "../../apps/web");
const studentStorageState = path.resolve(process.cwd(), ".auth/student.json");
const testServerEnv = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: e2eEnvironment.databaseUrl,
  SERVER_URL: e2eEnvironment.serverUrl,
  BETTER_AUTH_URL: e2eEnvironment.serverUrl,
  VITE_SERVER_URL: e2eEnvironment.serverUrl,
  PORT: String(e2eEnvironment.serverPort),
  WEB_PORT: String(e2eEnvironment.webPort),
};

export default defineConfig({
  testDir: "./src/specs",
  // Specs share one seeded database and authenticated storage state; keep the
  // workflow deterministic instead of racing state-changing scenarios.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: webUrl,
    storageState: studentStorageState,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `bun --env-file="${resolvedEnvFile}" run dev`,
      cwd: serverCwd,
      url: `${serverUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stderr: "pipe",
      stdout: "pipe",
      // Automated E2E must never touch the real Google Calendar: leaked CI
      // env (refresh token + enabled flag) would otherwise create/cancel live
      // events for undeliverable seed attendees and spam DSN bounces.
      env: {
        ...testServerEnv,
        GOOGLE_MEET_ENABLED: "false",
        GOOGLE_MEET_REFRESH_TOKEN: "",
        GOOGLE_MEET_CLIENT_ID: "",
        GOOGLE_MEET_CLIENT_SECRET: "",
        GOOGLE_CLIENT_EMAIL: "",
        GOOGLE_PRIVATE_KEY: "",
        GOOGLE_IMPERSONATED_USER: "",
      },
    },
    {
      command: `bun --env-file="${resolvedEnvFile}" run dev -- --mode test`,
      cwd: webCwd,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      stderr: "pipe",
      stdout: "pipe",
      env: testServerEnv,
    },
  ],
  globalSetup: "./src/fixtures/global-setup.ts",
});
