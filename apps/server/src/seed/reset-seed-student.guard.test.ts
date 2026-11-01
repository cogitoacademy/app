import { describe, expect, test } from "bun:test";
import {
  assertSeedStudentFixture,
  RESET_TARGET_ERROR,
  resolveSeedStudentResetTarget,
  SEED_STUDENT_FIXTURE,
} from "./reset-seed-student.guard";

function t05Environment(
  databaseUrl = "postgresql://user:password@localhost:6769/cogito-test",
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    T05_ENROLLMENT_TEST_DB_PORT: "6769",
    DATABASE_URL: databaseUrl,
    ...overrides,
  };
}

describe("seed student reset safety", () => {
  test("accepts only the exact T05 disposable database and the separate payout test database", () => {
    expect(resolveSeedStudentResetTarget(t05Environment())).toBe("t05");
    expect(
      resolveSeedStudentResetTarget(
        t05Environment("postgresql://user:password@[::1]:6769/cogito-test"),
      ),
    ).toBe("t05");
    expect(
      resolveSeedStudentResetTarget({
        NODE_ENV: "test",
        DATABASE_URL:
          "postgresql://user:password@127.0.0.1:6770/cogito-test-payout",
      }),
    ).toBe("payout");
  });

  test("skips reserved dev/signup ports without cleanup", () => {
    expect(
      resolveSeedStudentResetTarget(
        t05Environment("postgresql://user:password@localhost:6767/cogito-app", {
          T05_ENROLLMENT_TEST_DB_PORT: undefined,
        }),
      ),
    ).toBe("skip");
    expect(
      resolveSeedStudentResetTarget(
        t05Environment(
          "postgresql://user:password@localhost:6768/cogito-test",
          {
            T05_ENROLLMENT_TEST_DB_PORT: undefined,
          },
        ),
      ),
    ).toBe("skip");
  });

  test("rejects mismatched, remote, and non-test targets", () => {
    for (const [databaseUrl, overrides] of [
      [
        "postgresql://user:password@localhost:6769/cogito-test?host=database.example",
        {},
      ],
      [
        "postgresql://user:password@localhost:6769/cogito-test",
        { T05_ENROLLMENT_TEST_DB_PORT: "6768" },
      ],
      ["postgresql://user:password@database.example:6769/cogito-test", {}],
      [
        "postgresql://user:password@localhost:6770/cogito-test-payout",
        { NODE_ENV: "development" },
      ],
    ] as const) {
      expect(() =>
        resolveSeedStudentResetTarget(t05Environment(databaseUrl, overrides)),
      ).toThrow(RESET_TARGET_ERROR);
    }
  });

  test("does not include database credentials in target errors", () => {
    expect(() =>
      resolveSeedStudentResetTarget(
        t05Environment(
          "postgresql://private-user:private-password@db.example/cogito",
        ),
      ),
    ).toThrow(RESET_TARGET_ERROR);
    expect(RESET_TARGET_ERROR).not.toContain("private-user");
    expect(RESET_TARGET_ERROR).not.toContain("private-password");
  });

  test("requires the exact seeded student identity", () => {
    expect(() => assertSeedStudentFixture(SEED_STUDENT_FIXTURE)).not.toThrow();
    expect(() =>
      assertSeedStudentFixture({
        ...SEED_STUDENT_FIXTURE,
        email: "cogito.argya@yopmail.com",
        name: "Argya by Cogito",
      }),
    ).toThrow("exact fixture identity");
    expect(() =>
      assertSeedStudentFixture({ ...SEED_STUDENT_FIXTURE, role: "admin" }),
    ).toThrow("exact fixture identity");
  });
});
