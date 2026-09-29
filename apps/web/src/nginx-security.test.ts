import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

const nginxConfig = readFileSync(
  new URL("../nginx.conf", import.meta.url),
  "utf8",
);

describe("web nginx CSP", () => {
  test("allows the production API to host Knowledge Bank PDF frames", () => {
    expect(nginxConfig).toContain(
      "frame-src 'self' https://api.cogitoacademy.id",
    );
  });

  test("keeps the web app non-frameable", () => {
    expect(nginxConfig).toContain("frame-ancestors 'none'");
  });
});
