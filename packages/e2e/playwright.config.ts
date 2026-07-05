import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the local dev stack.
 *
 * Required environment:
 *   - DATABASE_URL pointing at the local Postgres container
 *   - SERVER_URL=http://localhost:3001
 *   - WEB_URL=http://localhost:3000
 *
 * Playwright will start the API and web dev servers if they are not already
 * running, then seed the database before the test run.
 */
const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
const serverUrl = process.env.SERVER_URL ?? "http://localhost:3001";
const envFile = process.env.ENV_FILE ?? "../../apps/server/.env";

export default defineConfig({
  testDir: "./src/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: webUrl,
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
      command: `bun --env-file ${envFile} run --cwd ../../apps/server dev`,
      url: `${serverUrl}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stderr: "pipe",
      stdout: "pipe",
    },
    {
      command: `bun --env-file ${envFile} run --cwd ../../apps/web dev`,
      url: webUrl,
      reuseExistingServer: true,
      timeout: 120_000,
      stderr: "pipe",
      stdout: "pipe",
    },
  ],
  globalSetup: "./src/fixtures/global-setup.ts",
});
