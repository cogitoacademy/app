import { defineConfig } from "@playwright/test";
import path from "node:path";
// No API process, DB, global setup, seeds or providers.
export default defineConfig({
  testDir: "./src/specs",
  testMatch: "kol-settlement-synthetic.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results/kol-settlement-synthetic",
  use: {
    baseURL: "http://localhost:3306",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node --max-old-space-size=384 ./node_modules/vite/bin/vite.js dev --mode test --configLoader runner --config ../../packages/e2e/vite.kol-settlement-synthetic.config.ts",
    cwd: path.resolve(import.meta.dirname, "../../apps/web"),
    url: "http://localhost:3306",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NODE_ENV: "test",
      WEB_PORT: "3306",
      VITE_SERVER_URL: "http://localhost:3307",
    },
  },
});
