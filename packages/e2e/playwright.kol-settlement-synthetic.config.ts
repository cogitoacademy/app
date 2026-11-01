import { defineConfig } from "@playwright/test";
import path from "node:path";
const webPort = process.env.KOL_WEB_PORT ?? "3306";
const apiPort = process.env.KOL_API_PORT ?? "3307";
// No API process, DB, global setup, seeds or providers.
export default defineConfig({
  testDir: "./src/specs",
  testMatch: "kol-settlement-synthetic.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results/kol-settlement-synthetic",
  use: {
    baseURL: `http://localhost:${webPort}`,
    browserName: "chromium",
    channel: process.env.KOL_BROWSER_CHANNEL,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --max-old-space-size=384 ./node_modules/vite/bin/vite.js dev --mode test --configLoader runner --config ../../packages/e2e/vite.kol-settlement-synthetic.config.ts",
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
