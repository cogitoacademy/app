import { defineConfig } from "@playwright/test";
import path from "node:path";

// Synthetic session/RPC responses; no database, API server, seed or provider.
export default defineConfig({
  testDir: "./src/specs",
  testMatch: "classes-layout.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results/classes-layout",
  use: {
    baseURL: "http://localhost:3300",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "node --max-old-space-size=384 ./node_modules/vite/bin/vite.js dev --mode test --configLoader runner --config ../../packages/e2e/vite.classes-layout.config.ts",
    cwd: path.resolve(import.meta.dirname, "../../apps/web"),
    url: "http://localhost:3300",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NODE_ENV: "test",
      WEB_PORT: "3300",
      VITE_SERVER_URL: "http://localhost:3001",
    },
  },
});
