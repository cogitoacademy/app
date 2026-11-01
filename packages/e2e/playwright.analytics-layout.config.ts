import { defineConfig } from "@playwright/test";
import finance from "./playwright.finance-layout.config";

// Local UI with mocked RPC only: no API, database, seed or provider calls.
export default defineConfig({
  ...finance,
  testMatch: "analytics-layout.spec.ts",
  outputDir: "./test-results/analytics-layout",
  use: { ...finance.use, reducedMotion: "reduce" },
});
