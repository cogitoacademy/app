import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import dotenv from "dotenv";

async function globalSetup() {
  const serverDir = path.resolve(process.cwd(), "../../apps/server");
  const envFile = path.resolve(
    process.cwd(),
    process.env.ENV_FILE ??
      [
        "../../apps/server/.env.test",
        "../../apps/server/.env.test.example",
      ].find((candidate) =>
        existsSync(path.resolve(process.cwd(), candidate)),
      ) ??
      "../../apps/server/.env.test.example",
  );

  dotenv.config({ path: envFile });

  console.log("Resetting seed student state...");
  const testSeedEnv = {
    ...process.env,
    NODE_ENV: "test",
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
  const serverUrl =
    process.env.SERVER_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3101";
  const authContext = await request.newContext({
    baseURL: serverUrl,
  });
  const signIn = await authContext.post("/api/auth/sign-in/email", {
    data: {
      email: "student.seed@cogitoacademy.id",
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
