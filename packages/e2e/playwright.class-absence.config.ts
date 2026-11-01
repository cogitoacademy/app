import { defineConfig } from "@playwright/test";
import finance from "./playwright.finance-layout.config";

// Local UI with mocked auth/RPC only: no API, database, seed or provider calls.
export default defineConfig({
  ...finance,
  testMatch: "class-absence.spec.ts",
  outputDir: "./test-results/class-absence",
  use: { ...finance.use, reducedMotion: "reduce" },
});
