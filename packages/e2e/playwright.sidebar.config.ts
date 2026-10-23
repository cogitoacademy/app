import { defineConfig } from "@playwright/test";
import classesLayout from "./playwright.classes-layout.config";

// Isolated synthetic sidebar checks; never reuse a dev server or saved session.
export default defineConfig({
  ...classesLayout,
  grep: /sidebar sections/,
  outputDir: "./test-results/sidebar",
  use: { ...classesLayout.use, baseURL: "http://localhost:3302" },
  webServer: {
    ...classesLayout.webServer,
    url: "http://localhost:3302",
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      WEB_PORT: "3302",
      VITE_SERVER_URL: "http://localhost:3399",
      VITE_TEST_CACHE_DIR: "../../tmp/sidebar-vite-cache",
    },
  },
});
