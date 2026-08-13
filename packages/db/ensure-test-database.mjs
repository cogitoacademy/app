import { existsSync } from "node:fs";
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({
  path:
    process.env.ENV_FILE ??
    ["../../apps/server/.env.test", "../../apps/server/.env.test.example"].find(
      (candidate) => existsSync(candidate),
    ) ??
    "../../apps/server/.env.test.example",
  override: true,
});

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return new URL(databaseUrl);
}

function getDatabaseName(databaseUrl) {
  return decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
}

function assertSafeTestDatabase(databaseName) {
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to create or migrate non-test database '${databaseName}'.`,
    );
  }
}

async function ensureTestDatabase() {
  const targetUrl = getDatabaseUrl();
  const databaseName = getDatabaseName(targetUrl);
  assertSafeTestDatabase(databaseName);

  const adminUrl = new URL(targetUrl.toString());
  adminUrl.pathname = "/postgres";

  const sql = postgres(adminUrl.toString(), {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const existing = await sql`
      select exists(
        select 1 from pg_database where datname = ${databaseName}
      ) as exists
    `;

    if (existing[0]?.exists) {
      console.log(`Test database '${databaseName}' already exists.`);
      return;
    }

    const escapedName = databaseName.replaceAll(`"`, `""`);
    try {
      await sql.unsafe(`create database "${escapedName}"`);
    } catch (error) {
      if (error?.code === "23505") {
        console.log(`Test database '${databaseName}' already exists.`);
        return;
      }

      throw error;
    }
    console.log(`Created test database '${databaseName}'.`);
  } finally {
    await sql.end();
  }
}

ensureTestDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
