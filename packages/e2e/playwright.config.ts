import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/**
 * E2E tests run against the local dev stack.
 *
 * Required environment:
 *   - DATABASE_URL pointing at the local Postgres container
 *   - SERVER_URL=http://localhost:3101
 *   - WEB_URL=http://localhost:3100
 *
 * Playwright will start the API and web dev servers if they are not already
 * running, then seed the database before the test run.
 */
const envFile =
  process.env.ENV_FILE ??
  ["../../apps/server/.env.test", "../../apps/server/.env.test.example"].find(
    (candidate) => existsSync(path.resolve(process.cwd(), candidate)),
  ) ??
  "../../apps/server/.env.test.example";
const resolvedEnvFile = path.resolve(process.cwd(), envFile);
dotenv.config({ path: resolvedEnvFile });
const webUrl = process.env.WEB_URL ?? "http://localhost:3100";
const serverUrl = process.env.SERVER_URL ?? "http://localhost:3101";
const serverCwd = path.resolve(process.cwd(), "../../apps/server");
const webCwd = path.resolve(process.cwd(), "../../apps/web");
const studentStorageState = path.resolve(process.cwd(), ".auth/student.json");

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
    trace: "on-first-retry",
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
      command: `bun --env-file=${resolvedEnvFile} run dev`,
      cwd: serverCwd,
      url: `${serverUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stderr: "pipe",
      stdout: "pipe",
    },
    {
      command: `bun --env-file=${resolvedEnvFile} run dev`,
      cwd: webCwd,
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stderr: "pipe",
      stdout: "pipe",
    },
  ],
  globalSetup: "./src/fixtures/global-setup.ts",
});
