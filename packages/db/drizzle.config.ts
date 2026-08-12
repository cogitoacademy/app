import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

const requestedEnvPath = process.env.ENV_FILE;
const envPath = requestedEnvPath
  ? resolve(requestedEnvPath)
  : resolve("../../apps/server/.env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    `DATABASE_URL is required. Set it as an env var or create ${envPath}`,
  );
}

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
