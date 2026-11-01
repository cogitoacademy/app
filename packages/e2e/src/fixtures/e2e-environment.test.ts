import { describe, expect, test } from "bun:test";
import path from "node:path";
import { resolveE2eEnvironment, resolveE2eEnvFile } from "./e2e-environment";

const validDatabaseUrl =
  "postgresql://postgres:password@localhost:6767/cogito-test";
const validPayoutDatabaseUrl =
  "postgresql://postgres:password@localhost:6770/cogito-test-payout";
const databaseError =
  "E2E DATABASE_URL must target loopback PostgreSQL cogito-test on port 6767, 6768, or 6769, or cogito-test-payout on port 6770.";

function validEnvironment(
  databaseUrl: string | undefined,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: "http://localhost:3101",
    VITE_SERVER_URL: "http://localhost:3101",
    PORT: "3101",
    WEB_PORT: "3100",
    ...overrides,
  };
}

describe("E2E environment safety", () => {
  test("resolves selected relative env files before child processes change cwd", () => {
    const e2ePackageDir = path.resolve(import.meta.dir, "../..");
    const selectedEnvFile = "../../apps/server/.env.test-payout";

    expect(
      resolveE2eEnvFile(e2ePackageDir, { ENV_FILE: selectedEnvFile }),
    ).toBe(path.resolve(e2ePackageDir, selectedEnvFile));
  });

  test("accepts localhost, IPv4 loopback, and IPv6 loopback PostgreSQL URLs", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const environment = resolveE2eEnvironment(
        validEnvironment(
          `postgresql://postgres:password@${host}:6767/cogito-test`,
        ),
      );

      expect(environment.databaseUrl).toContain("/cogito-test");
      expect(environment.serverUrl).toBe("http://localhost:3101");
      expect(environment.webUrl).toBe("http://localhost:3100");
    }
  });

  test("accepts the isolated tutor payout test database", () => {
    const environment = resolveE2eEnvironment(
      validEnvironment(validPayoutDatabaseUrl),
    );

    expect(environment.databaseUrl).toBe(validPayoutDatabaseUrl);
  });

  test("rejects missing and malformed database URLs", () => {
    for (const databaseUrl of [undefined, "", "not-a-url", "postgresql://["]) {
      expect(() =>
        resolveE2eEnvironment(validEnvironment(databaseUrl)),
      ).toThrow(databaseError);
    }
  });

  test("rejects remote and maliciously decorated hostnames", () => {
    for (const value of [
      "postgresql://postgres:password@db.example.com/cogito-test",
      "postgresql://postgres:password@localhost.attacker.test/cogito-test",
      "postgresql://postgres:password@127.0.0.1.attacker.test/cogito-test",
      "postgresql://localhost@attacker.test/cogito-test",
      "postgresql://postgres:password@localhost./cogito-test",
    ]) {
      expect(() => resolveE2eEnvironment(validEnvironment(value))).toThrow(
        databaseError,
      );
    }
  });

  test("requires the exact test database name and PostgreSQL scheme", () => {
    for (const value of [
      "postgresql://postgres:password@localhost/cogito",
      "postgresql://postgres:password@localhost/cogito-dev",
      "postgresql://postgres:password@localhost/cogito-test-shadow",
      "postgresql://postgres:password@localhost/cogito-test/",
      "mysql://postgres:password@localhost/cogito-test",
    ]) {
      expect(() => resolveE2eEnvironment(validEnvironment(value))).toThrow(
        databaseError,
      );
    }
  });

  test("rejects ambient database overrides even when the test file is safe", () => {
    const safeDotenv = validEnvironment(validDatabaseUrl);
    const resolvedEnvironment = {
      ...safeDotenv,
      DATABASE_URL:
        "postgresql://postgres:password@db.example.com/cogito-production",
    };

    expect(() => resolveE2eEnvironment(resolvedEnvironment)).toThrow(
      databaseError,
    );
  });

  test("preserves the standard worker ports and isolates payout on port 6770", () => {
    for (const port of ["6767", "6768", "6769"]) {
      expect(
        resolveE2eEnvironment(
          validEnvironment(
            `postgresql://postgres:password@localhost:${port}/cogito-test`,
          ),
        ).databaseUrl,
      ).toContain("/cogito-test");
    }

    for (const value of [
      "postgresql://postgres:password@localhost:6770/cogito-test",
      "postgresql://postgres:password@localhost:6767/cogito-test-payout",
      "postgresql://postgres:password@localhost:6768/cogito-test-payout",
      "postgresql://postgres:password@localhost:6769/cogito-test-payout",
    ]) {
      expect(() => resolveE2eEnvironment(validEnvironment(value))).toThrow(
        databaseError,
      );
    }
  });

  test("does not include database credentials in guard errors", () => {
    const secretUrl =
      "postgresql://private-user:private-password@database.example.com/cogito-production";
    let errorMessage = "";
    try {
      resolveE2eEnvironment(validEnvironment(secretUrl));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).toContain("E2E DATABASE_URL must target loopback");
    expect(errorMessage).not.toContain("private-user");
    expect(errorMessage).not.toContain("private-password");
  });

  test("requires explicit test mode and local server targets on matching ports", () => {
    expect(() =>
      resolveE2eEnvironment(
        validEnvironment(validDatabaseUrl, { NODE_ENV: "development" }),
      ),
    ).toThrow("E2E requires explicit NODE_ENV=test configuration.");
    expect(() =>
      resolveE2eEnvironment(
        validEnvironment(validDatabaseUrl, { NODE_ENV: undefined }),
      ),
    ).toThrow("E2E requires explicit NODE_ENV=test configuration.");
    expect(() =>
      resolveE2eEnvironment(
        validEnvironment(validDatabaseUrl, {
          SERVER_URL: "https://api.cogitoacademy.id",
        }),
      ),
    ).toThrow("E2E SERVER_URL must be a loopback HTTP origin.");
    expect(() =>
      resolveE2eEnvironment(
        validEnvironment(validDatabaseUrl, {
          VITE_SERVER_URL: "http://localhost:3001",
        }),
      ),
    ).toThrow("E2E VITE_SERVER_URL must resolve to the local test API.");
    expect(() =>
      resolveE2eEnvironment(
        validEnvironment(validDatabaseUrl, { WEB_PORT: "3000" }),
      ),
    ).toThrow("E2E WEB_PORT must match its configured loopback URL port.");
  });
});
