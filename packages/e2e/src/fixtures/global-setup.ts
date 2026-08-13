import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
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
  execSync("bun run src/reset-seed-student.ts", {
    cwd: serverDir,
    env: { ...process.env, NODE_ENV: "test" },
    stdio: "inherit",
  });
  console.log("Seeding database for E2E tests...");
  execSync("bun run src/seed.ts", {
    cwd: serverDir,
    env: { ...process.env, NODE_ENV: "test" },
    stdio: "inherit",
  });
  console.log("Seed complete.");
}

export default globalSetup;
