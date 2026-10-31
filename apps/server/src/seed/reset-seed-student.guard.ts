const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const SEED_STUDENT_FIXTURE = {
  email: "cogito.andre@yopmail.com",
  name: "Andre by Cogito",
  role: "student",
} as const;

export const RESET_TARGET_ERROR =
  "Seed student reset requires a dedicated loopback test database: T05 cogito-test on port 6769 or cogito-test-payout on port 6770.";

export type SeedStudentIdentity = {
  email: string;
  name: string;
  role: string;
};

export function resolveSeedStudentResetTarget(
  env: NodeJS.ProcessEnv,
): "t05" | "payout" | "skip" {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new Error(RESET_TARGET_ERROR);
  }

  const hostname = databaseUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const loopbackPostgres =
    ["postgres:", "postgresql:"].includes(databaseUrl.protocol) &&
    LOOPBACK_HOSTS.has(hostname);

  if (
    env.NODE_ENV !== "test" ||
    !loopbackPostgres ||
    databaseUrl.search !== "" ||
    databaseUrl.hash !== ""
  ) {
    throw new Error(RESET_TARGET_ERROR);
  }

  if (
    env.T05_ENROLLMENT_TEST_DB_PORT === "6769" &&
    databaseUrl.port === "6769" &&
    databaseUrl.pathname === "/cogito-test"
  ) {
    return "t05";
  }

  if (
    env.T05_ENROLLMENT_TEST_DB_PORT === undefined &&
    databaseUrl.port === "6770" &&
    databaseUrl.pathname === "/cogito-test-payout"
  ) {
    return "payout";
  }

  if (databaseUrl.port === "6767" || databaseUrl.port === "6768") {
    return "skip";
  }

  throw new Error(RESET_TARGET_ERROR);
}

export function assertSeedStudentFixture(identity: SeedStudentIdentity) {
  if (
    identity.email !== SEED_STUDENT_FIXTURE.email ||
    identity.name !== SEED_STUDENT_FIXTURE.name ||
    identity.role !== SEED_STUDENT_FIXTURE.role
  ) {
    throw new Error(
      "Seed student reset refused because the exact fixture identity did not match.",
    );
  }
}
