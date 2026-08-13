import { describe, expect, test } from "bun:test";

import { resolveServerUrl } from "./resolve-server-url";

describe("resolveServerUrl", () => {
  test("keeps the configured URL for localhost development", () => {
    expect(resolveServerUrl("http://localhost:3001", "localhost", true)).toBe(
      "http://localhost:3001",
    );
  });

  test("uses the browser hostname for loopback development", () => {
    expect(resolveServerUrl("http://localhost:3001", "127.0.0.1", true)).toBe(
      "http://127.0.0.1:3001",
    );
  });

  test("uses the browser hostname for LAN development", () => {
    expect(
      resolveServerUrl("http://localhost:3001", "192.168.1.78", true),
    ).toBe("http://192.168.1.78:3001");
  });

  test("keeps the configured URL in production", () => {
    expect(
      resolveServerUrl(
        "https://api.cogito.example",
        "app.cogito.example",
        false,
      ),
    ).toBe("https://api.cogito.example");
  });

  test("keeps the configured URL when no browser hostname exists", () => {
    expect(resolveServerUrl("http://localhost:3001", undefined, true)).toBe(
      "http://localhost:3001",
    );
  });
});
