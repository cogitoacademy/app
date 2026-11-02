import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const nginxConfig = readFileSync(
  new URL("../nginx.conf", import.meta.url),
  "utf8",
);

describe("web nginx CSP", () => {
  test("allows the production API to host Knowledge Bank PDF frames", () => {
    expect(nginxConfig).toContain(
      "frame-src 'self' blob: https://api.cogitoacademy.id",
    );
  });

  test("keeps the web app non-frameable", () => {
    expect(nginxConfig).toContain("frame-ancestors 'none'");
  });

  test("allows blob image previews for client-side uploads", () => {
    expect(nginxConfig).toContain("img-src 'self' data: blob: https:");
  });

  test("allows the Cloudflare Insights beacon script", () => {
    expect(nginxConfig).toContain(
      "script-src 'self' https://*.posthog.com https://static.cloudflareinsights.com",
    );
  });
});
