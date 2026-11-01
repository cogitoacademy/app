import { existsSync } from "node:fs";
import dotenv from "dotenv";
import postgres from "postgres";

const TEST_DATABASE_PORTS = new Map([
  ["cogito-test", new Set(["6767", "6768", "6769"])],
  ["cogito-test-settlement", new Set(["6767"])],
  ["cogito-test-payout", new Set(["6770"])],
]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

function assertSafeTestDatabase(databaseUrl, databaseName) {
  const hostname = databaseUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    process.env.NODE_ENV !== "test" ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !LOOPBACK_HOSTS.has(hostname) ||
    !TEST_DATABASE_PORTS.get(databaseName)?.has(databaseUrl.port)
  ) {
    throw new Error(
      `Refusing to create or migrate outside a supported loopback test target (database '${databaseName}').`,
    );
  }
}

async function ensureTestDatabase() {
  const targetUrl = getDatabaseUrl();
  const databaseName = getDatabaseName(targetUrl);
  assertSafeTestDatabase(targetUrl, databaseName);

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
