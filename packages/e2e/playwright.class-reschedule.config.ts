import { defineConfig } from "@playwright/test";
import finance from "./playwright.finance-layout.config";

// Synthetic UI only: finance supplies the isolated 3356/3357 Vite harness and Edge channel.
export default defineConfig({
  ...finance,
  testMatch: "class-reschedule.spec.ts",
  outputDir: "./test-results/class-reschedule",
  use: { ...finance.use, timezoneId: "UTC" },
});
