import { defineConfig } from "@playwright/test";
import path from "node:path";
import config from "./playwright.classes-layout.config";

// Synthetic browser contracts only; no global setup, API, database or providers.
export default defineConfig({
  ...config,
  testMatch: "v3-referral-kol.spec.ts",
  outputDir: "./test-results/v3-referral-kol",
  use: { ...config.use, baseURL: "http://localhost:3304" },
  webServer: {
    command:
      "node --max-old-space-size=384 ./node_modules/vite/bin/vite.js dev --mode test --configLoader runner --config ../../packages/e2e/vite.classes-layout.config.ts",
    cwd: path.resolve(import.meta.dirname, "../../apps/web"),
    url: "http://localhost:3304",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NODE_ENV: "test",
      WEB_PORT: "3304",
      VITE_SERVER_URL: "http://localhost:3305",
      VITE_TEST_CACHE_DIR: "../../tmp/v3-referral-kol-vite-cache",
    },
  },
});
