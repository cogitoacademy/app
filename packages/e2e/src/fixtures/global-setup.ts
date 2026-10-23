import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import dotenv from "dotenv";
import { resolveE2eEnvironment, resolveE2eEnvFile } from "./e2e-environment";
import { ADMIN_EMAIL, TUTOR_EMAIL } from "./test-accounts";
import {
  createRunScopedStudentEmail,
  DEFAULT_STUDENT_EMAIL,
} from "./student-identity";

/**
 * T05 uses its own disposable database. Keep this opt-in guard scoped to that
 * runner so existing 6767/6768 test workflows keep their own target rules.
 */
function assertT05EnrollmentTarget(env: NodeJS.ProcessEnv) {
  const dbPort = env.T05_ENROLLMENT_TEST_DB_PORT;
  if (dbPort === undefined) return;

  const redisPort = env.T05_ENROLLMENT_TEST_REDIS_PORT;
  const serverPort = env.T05_ENROLLMENT_TEST_SERVER_PORT;
  const webPort = env.T05_ENROLLMENT_TEST_WEB_PORT;
  let databaseUrl: URL;
  let redisUrl: URL;
  let serverUrl: URL;
  let webUrl: URL;
  try {
    databaseUrl = new URL(env.DATABASE_URL ?? "");
    redisUrl = new URL(env.REDIS_URL ?? "");
    serverUrl = new URL(env.SERVER_URL ?? env.BETTER_AUTH_URL ?? "");
    webUrl = new URL(env.WEB_URL ?? "");
  } catch {
    throw new Error("T05 E2E target configuration is incomplete.");
  }

  const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    env.NODE_ENV !== "test" ||
    dbPort !== "6769" ||
    redisPort !== "6381" ||
    serverPort !== "3201" ||
    webPort !== "3200" ||
    !/^\d+$/.test(dbPort) ||
    !/^\d+$/.test(redisPort ?? "") ||
    !/^\d+$/.test(serverPort ?? "") ||
    !/^\d+$/.test(webPort ?? "") ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !loopback.has(databaseUrl.hostname.toLowerCase()) ||
    databaseUrl.port !== dbPort ||
    databaseUrl.pathname !== "/cogito-test" ||
    redisUrl.protocol !== "redis:" ||
    !loopback.has(redisUrl.hostname.toLowerCase()) ||
    redisUrl.port !== redisPort ||
    serverUrl.protocol !== "http:" ||
    !loopback.has(serverUrl.hostname.toLowerCase()) ||
    serverUrl.port !== serverPort ||
    webUrl.protocol !== "http:" ||
    !loopback.has(webUrl.hostname.toLowerCase()) ||
    webUrl.port !== webPort
  ) {
    throw new Error(
      "T05 E2E requires NODE_ENV=test, loopback cogito-test, and the configured isolated DB/Redis/API/web ports.",
    );
  }
}

async function saveRoleStorageState(
  role: "admin" | "tutor",
  email: string,
  password: string,
  serverUrl: string,
  authDir: string,
) {
  const roleContext = await request.newContext({ baseURL: serverUrl });
  try {
    const roleSignIn = await roleContext.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    if (!roleSignIn.ok()) {
      throw new Error(
        `Failed to create E2E ${role} storage state (${roleSignIn.status()})`,
      );
    }
    await roleContext.storageState({
      path: path.join(authDir, `${role}.json`),
    });
  } finally {
    await roleContext.dispose();
  }
}

async function globalSetup() {
  const envFile = resolveE2eEnvFile(process.cwd(), process.env);
  const envLoadResult = dotenv.config({ path: envFile, override: false });
  if (envLoadResult.error) {
    throw new Error("E2E environment file could not be loaded.");
  }
  // Keep setup and Playwright servers on the same resolved test configuration.
  process.env.ENV_FILE = envFile;
  assertT05EnrollmentTarget(process.env);
  const e2eEnvironment = resolveE2eEnvironment(process.env);
  const serverDir = path.resolve(process.cwd(), "../../apps/server");
  const runScopedStudentEmail =
    process.env.T05_ENROLLMENT_TEST_DB_PORT === "6769"
      ? createRunScopedStudentEmail(randomUUID())
      : DEFAULT_STUDENT_EMAIL;

  // The T05 disposable database keeps each run's enrollment, cancellation and
  // payment history attached to its own seeded student instead of deleting it.
  process.env.E2E_STUDENT_EMAIL = runScopedStudentEmail;
  process.env.SEED_REVIEW_STUDENT_EMAIL = runScopedStudentEmail;

  console.log(
    process.env.T05_ENROLLMENT_TEST_DB_PORT === "6769"
      ? "Creating a fresh T05 student identity for this run..."
      : "Resetting seed student state...",
  );
  const testSeedEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: e2eEnvironment.databaseUrl,
    SERVER_URL: e2eEnvironment.serverUrl,
    BETTER_AUTH_URL: e2eEnvironment.serverUrl,
    VITE_SERVER_URL: e2eEnvironment.serverUrl,
    PORT: String(e2eEnvironment.serverPort),
    WEB_PORT: String(e2eEnvironment.webPort),
    // Never hit the live Google Calendar from automated E2E, even if the
    // ambient env carries prod Meet credentials.
    GOOGLE_MEET_ENABLED: "false",
    GOOGLE_MEET_REFRESH_TOKEN: "",
    GOOGLE_MEET_CLIENT_ID: "",
    GOOGLE_MEET_CLIENT_SECRET: "",
    GOOGLE_CLIENT_EMAIL: "",
    GOOGLE_PRIVATE_KEY: "",
    GOOGLE_IMPERSONATED_USER: "",
    RESEND_API_KEY: "",
    E2E_STUDENT_EMAIL: runScopedStudentEmail,
    SEED_REVIEW_STUDENT_EMAIL: runScopedStudentEmail,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "AdminPassword123!",
    SEED_TUTOR_PASSWORD: process.env.SEED_TUTOR_PASSWORD ?? "Tutor123!",
    SEED_STUDENT_PASSWORD: process.env.SEED_STUDENT_PASSWORD ?? "Student123!",
  };

  execFileSync(
    "bun",
    [`--env-file=${envFile}`, "run", "src/seed/reset-seed-student.ts"],
    {
      cwd: serverDir,
      env: testSeedEnv,
      stdio: "inherit",
    },
  );
  console.log("Seeding database for E2E tests...");
  execFileSync("bun", [`--env-file=${envFile}`, "run", "src/seed/seed.ts"], {
    cwd: serverDir,
    env: testSeedEnv,
    stdio: "inherit",
  });

  if (process.env.T05_ENROLLMENT_TEST_DB_PORT === "6769") {
    execFileSync(
      "bun",
      [`--env-file=${envFile}`, "run", "src/seed/enable-t05-top-up-fixture.ts"],
      {
        cwd: serverDir,
        env: testSeedEnv,
        stdio: "inherit",
      },
    );
  }

  // Reuse one authenticated student session across specs. The server's auth
  // limiter intentionally allows only 10 sign-in attempts per IP/minute;
  // logging the same seeded user in for every test would make the suite hit
  // that production safeguard before the economy specs begin.
  const authDir = path.resolve(process.cwd(), ".auth");
  mkdirSync(authDir, { recursive: true });
  const authContext = await request.newContext({
    baseURL: e2eEnvironment.serverUrl,
  });
  const signIn = await authContext.post("/api/auth/sign-in/email", {
    data: {
      email: runScopedStudentEmail,
      password: testSeedEnv.SEED_STUDENT_PASSWORD,
    },
  });
  if (!signIn.ok()) {
    throw new Error(
      `Failed to create E2E student storage state (${signIn.status()})`,
    );
  }
  await authContext.storageState({ path: path.join(authDir, "student.json") });
  await authContext.dispose();

  if (
    process.env.T06_CLASS_LIFECYCLE_E2E === "1" ||
    process.env.T07_CLASS_REPORTS_E2E === "1" ||
    process.env.T07_ON_DEMAND_BOOKING_REPORTS_E2E === "1"
  ) {
    await saveRoleStorageState(
      "admin",
      ADMIN_EMAIL,
      testSeedEnv.SEED_ADMIN_PASSWORD,
      e2eEnvironment.serverUrl,
      authDir,
    );
  }
  if (
    process.env.T07_CLASS_REPORTS_E2E === "1" ||
    process.env.T07_ON_DEMAND_BOOKING_REPORTS_E2E === "1"
  ) {
    await saveRoleStorageState(
      "tutor",
      TUTOR_EMAIL,
      testSeedEnv.SEED_TUTOR_PASSWORD,
      e2eEnvironment.serverUrl,
      authDir,
    );
  }
  console.log("Seed complete.");
}

export default globalSetup;
