import { defineConfig } from "@playwright/test";
import finance from "./playwright.finance-layout.config";

// Browser rendering with local RPC mocks only: no API, database, seed or providers.
export default defineConfig({
  ...finance,
  use: { ...finance.use, reducedMotion: "reduce" },
  testMatch: "v3-ui-cleanup.spec.ts",
  outputDir: "./test-results/v3-ui-cleanup",
});
