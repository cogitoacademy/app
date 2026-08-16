import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { assertPasswordPolicy } from "@cogito-app/auth";

// C6: password policy (upper/lower/digit, min 8) — validator unit tests plus
// a source-level assertion that the server route wires the guard at sign-up
// (mirrors the repo's route-testing pattern; app.handle on this route trips a
// Bun 1.3.14 engine segfault, so full HTTP coverage lives in CI/manual E2E).
describe("C6: password policy", () => {
  test("rejects passwords missing an uppercase letter", () => {
    expect(assertPasswordPolicy("lowercase1")).toContain("uppercase");
  });

  test("rejects passwords missing a digit", () => {
    expect(assertPasswordPolicy("Lowercase")).toContain("digit");
  });

  test("rejects passwords missing a lowercase letter", () => {
    expect(assertPasswordPolicy("UPPERCASE1")).toContain("lowercase");
  });

  test("accepts a compliant password", () => {
    expect(assertPasswordPolicy("Test1234!")).toBeNull();
  });

  test("server route guards sign-up with the policy", () => {
    const routes = readFileSync(
      new URL("./routes.ts", import.meta.url),
      "utf-8",
    );
    expect(routes).toContain("assertPasswordPolicy");
    expect(routes).toContain('"/api/auth/sign-up/email"');
  });
});
