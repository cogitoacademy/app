import { defineConfig } from "@playwright/test";
import path from "node:path";
const webPort = "3376";
const apiPort = "3377";
// No API process, DB, global setup, seeds or providers.
export default defineConfig({
  testDir: "./src/specs",
  testMatch: "competition-types-synthetic.spec.ts",
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results/competition-types-synthetic",
  use: {
    baseURL: `http://localhost:${webPort}`,
    browserName: "chromium",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --max-old-space-size=384 ./node_modules/vite/bin/vite.js dev --mode test --configLoader runner --config ../../packages/e2e/vite.competition-types-synthetic.config.ts",
    cwd: path.resolve(import.meta.dirname, "../../apps/web"),
    url: `http://localhost:${webPort}`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NODE_ENV: "test",
      WEB_PORT: webPort,
      VITE_SERVER_URL: `http://localhost:${apiPort}`,
    },
  },
});
