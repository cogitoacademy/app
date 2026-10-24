import config from "./playwright.auth-form-focus.config";
export default {
  ...config,
  testMatch: "admin-referrals.spec.ts",
  outputDir: "./test-results/admin-referrals",
};
