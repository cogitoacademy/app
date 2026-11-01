import { defineConfig } from "@playwright/test";
import path from "node:path";
// No API process, DB, global setup, seeds or providers.
export default defineConfig({
  testDir: "./src/specs",
  testMatch: "kb-calendar-synthetic.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results/kb-calendar-synthetic",
  use: {
    baseURL: "http://localhost:3316",
    browserName: "chromium",
    channel: process.env.KB_BROWSER_CHANNEL,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --max-old-space-size=384 ./node_modules/vite/bin/vite.js dev --mode test --configLoader runner --config ../../packages/e2e/vite.kb-calendar-synthetic.config.ts",
    cwd: path.resolve(import.meta.dirname, "../../apps/web"),
    url: "http://localhost:3316",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NODE_ENV: "test",
      WEB_PORT: "3316",
      VITE_SERVER_URL: "http://localhost:3317",
    },
  },
});
