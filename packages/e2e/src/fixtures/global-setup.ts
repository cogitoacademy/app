import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import dotenv from "dotenv";
import { resolveE2eEnvironment, resolveE2eEnvFile } from "./e2e-environment";
import { STUDENT_EMAIL } from "./test-accounts";

async function globalSetup() {
  const envFile = resolveE2eEnvFile(process.cwd(), process.env);
  const envLoadResult = dotenv.config({ path: envFile, override: false });
  if (envLoadResult.error) {
    throw new Error("E2E environment file could not be loaded.");
  }
  // Keep setup and Playwright servers on the same resolved test configuration.
  process.env.ENV_FILE = envFile;
  const e2eEnvironment = resolveE2eEnvironment(process.env);
  const serverDir = path.resolve(process.cwd(), "../../apps/server");

  console.log("Resetting seed student state...");
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
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "AdminPassword123!",
    SEED_TUTOR_PASSWORD: process.env.SEED_TUTOR_PASSWORD ?? "Tutor123!",
    SEED_STUDENT_PASSWORD: process.env.SEED_STUDENT_PASSWORD ?? "Student123!",
  };

  execSync("bun run src/seed/reset-seed-student.ts", {
    cwd: serverDir,
    env: testSeedEnv,
    stdio: "inherit",
  });
  console.log("Seeding database for E2E tests...");
  execSync("bun run src/seed/seed.ts", {
    cwd: serverDir,
    env: testSeedEnv,
    stdio: "inherit",
  });

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
      email: STUDENT_EMAIL,
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
  console.log("Seed complete.");
}

export default globalSetup;
