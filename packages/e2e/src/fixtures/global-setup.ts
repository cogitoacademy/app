import { execSync } from "node:child_process";
import path from "node:path";

async function globalSetup() {
  const serverDir = path.resolve(process.cwd(), "../../apps/server");
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
