import { afterEach, describe, expect, test } from "bun:test";
import { assertSafeTestDatabase, resetDatabase } from "../helpers/test-client";

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("test client database safety", () => {
  test("rejects a malformed database URL before executing SQL", async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "not-a-url";

    await expect(resetDatabase()).rejects.toThrow(
      "resetDatabase() is blocked outside a dedicated test database",
    );
  });

  test("rejects reset outside test mode or on a non-test database", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL =
      "postgresql://postgres:password@localhost:6767/cogito-test";

    await expect(resetDatabase()).rejects.toThrow(
      "resetDatabase() is blocked outside a dedicated test database",
    );
  });

  test("accepts the isolated payout test database on its reserved port", () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL =
      "postgresql://postgres:password@localhost:6770/cogito-test-payout";

    expect(() => assertSafeTestDatabase()).not.toThrow();
  });

  test("rejects mismatched or reserved worktree database ports before SQL", () => {
    process.env.NODE_ENV = "test";
    for (const databaseUrl of [
      "postgresql://postgres:password@localhost:6767/cogito-test-payout",
      "postgresql://postgres:password@localhost:6770/cogito-test",
      "postgresql://postgres:password@localhost:6769/cogito-test-payout",
      "postgresql://postgres:password@db.example.com:6770/cogito-test-payout",
    ]) {
      process.env.DATABASE_URL = databaseUrl;
      expect(() => assertSafeTestDatabase()).toThrow(
        "resetDatabase() is blocked outside a dedicated test database",
      );
    }
  });
});
