import { defineConfig } from "@playwright/test";
import path from "node:path";
const webPort = "3356";
const apiPort = "3357";
// No API process, DB, global setup, seeds or providers.
export default defineConfig({
  testDir: "./src/specs",
  testMatch: "finance-layout.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results/finance-layout",
  use: {
    baseURL: `http://localhost:${webPort}`,
    browserName: "chromium",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --max-old-space-size=384 ./node_modules/vite/bin/vite.js dev --mode test --configLoader runner --config ../../packages/e2e/vite.finance-layout.config.ts",
    cwd: path.resolve(import.meta.dirname, "../../apps/web"),
    url: `http://localhost:${webPort}`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NODE_ENV: "test",
      VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: "",
      VITE_PUBLIC_POSTHOG_HOST: "",
      WEB_PORT: webPort,
      VITE_SERVER_URL: `http://localhost:${apiPort}`,
    },
  },
});
