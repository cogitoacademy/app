import { describe, expect, test } from "bun:test";
import {
  assertSafeTestDatabaseUrl,
  assertTestDatabaseResetAllowed,
} from "../helpers/test-database-safety";

const OLD_TEST_DATABASE =
  "postgresql://postgres:password@localhost:6767/cogito-test";
const DEDICATED_TEST_DATABASE =
  "postgresql://postgres:password@127.0.0.1:6769/cogito-test";
const PAYOUT_TEST_DATABASE =
  "postgresql://postgres:password@127.0.0.1:6770/cogito-test-payout";

describe("test database safety", () => {
  test("recognizes loopback test connections without granting reset consent", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(OLD_TEST_DATABASE, "test"),
    ).not.toThrow();
    expect(() =>
      assertTestDatabaseResetAllowed(
        OLD_TEST_DATABASE,
        "test",
        "true",
        OLD_TEST_DATABASE,
      ),
    ).toThrow();
  });

  test("rejects the development database even on the reserved loopback port", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://postgres:password@localhost:6767/cogito-app",
        "test",
      ),
    ).toThrow();
  });

  test("always rejects reset on reserved ports 6767 and 6768", () => {
    for (const databaseUrl of [
      OLD_TEST_DATABASE,
      "postgresql://postgres:password@localhost:6768/cogito-test",
    ]) {
      expect(() =>
        assertTestDatabaseResetAllowed(
          databaseUrl,
          "test",
          "true",
          databaseUrl,
        ),
      ).toThrow();
    }
  });

  test("requires independent opt-in and an exact target for dedicated databases", () => {
    for (const databaseUrl of [DEDICATED_TEST_DATABASE, PAYOUT_TEST_DATABASE]) {
      expect(() =>
        assertTestDatabaseResetAllowed(
          databaseUrl,
          "test",
          undefined,
          undefined,
        ),
      ).toThrow();
      expect(() =>
        assertTestDatabaseResetAllowed(databaseUrl, "test", "true", undefined),
      ).toThrow();
      expect(() =>
        assertTestDatabaseResetAllowed(
          databaseUrl,
          "test",
          "true",
          `${databaseUrl}?host=localhost`,
        ),
      ).toThrow();
      expect(() =>
        assertTestDatabaseResetAllowed(
          databaseUrl,
          "test",
          "true",
          databaseUrl.replace("@127.0.0.1:", "@localhost:"),
        ),
      ).toThrow();
      expect(() =>
        assertTestDatabaseResetAllowed(
          databaseUrl,
          "test",
          "true",
          databaseUrl,
        ),
      ).not.toThrow();
    }
  });

  test("requires NODE_ENV=test even with reset consent", () => {
    expect(() =>
      assertTestDatabaseResetAllowed(
        DEDICATED_TEST_DATABASE,
        "development",
        "true",
        DEDICATED_TEST_DATABASE,
      ),
    ).toThrow();
  });

  test("rejects unsafe URL forms and never includes credentials in errors", () => {
    const secret = "never-log-this-password";
    for (const databaseUrl of [
      "not-a-url",
      `postgresql://user:${secret}@db.example.com:6769/cogito-test`,
      `postgresql://user:${secret}@db.production.example.com:5432/cogito-production`,
      "postgresql://user:pass%40word@localhost:6769/cogito-test",
      "postgresql://user:pass@localhost:6769/cogito-test?host=db.example.com",
      "postgresql://user:pass@localhost:6769/cogito-test#fragment",
      "mysql://user:pass@localhost:6769/cogito-test",
      "postgresql://user:pass@localhost:6769/cogito-test-shadow",
    ]) {
      let errorMessage = "";
      try {
        assertTestDatabaseResetAllowed(
          databaseUrl,
          "test",
          "true",
          databaseUrl,
        );
      } catch (error) {
        errorMessage = (error as Error).message;
      }

      expect(errorMessage).not.toBe("");
      expect(errorMessage).not.toContain(secret);
      expect(errorMessage).not.toContain(databaseUrl);
    }
  });
});
