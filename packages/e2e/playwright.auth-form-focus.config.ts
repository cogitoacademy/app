import config from "./playwright.classes-layout.config";

export default {
  ...config,
  testMatch: "auth-form-focus.spec.ts",
  use: { ...config.use, channel: "msedge" },
  outputDir: "./test-results/auth-form-focus",
};
