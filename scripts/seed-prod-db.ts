#!/usr/bin/env bun
/**
 * Seed the production database from a developer terminal.
 *
 * This script never deletes data. It only runs the guarded seed in
 * `apps/server/src/seed/seed.ts`, which is idempotent for defaults.
 *
 * Required environment:
 *   PROD_DATABASE_URL      production PostgreSQL URL (never DATABASE_URL)
 *   SEED_ADMIN_PASSWORD    bootstrap admin password, 12+ characters
 *
 * Optional:
 *   SEED_TUTOR_PASSWORD      required with --with-demo-users
 *   SEED_STUDENT_PASSWORD    required with --with-demo-users
 *   PROD_DB_SSL=require      force TLS
 *   ALLOW_NONEMPTY_PROD_SEED=true   allow seeding when users already exist
 *
 * Usage:
 *   bun scripts/seed-prod-db.ts --confirm=<db-host>
 *   bun scripts/seed-prod-db.ts --confirm=<db-host> --via-tunnel
 *   bun scripts/seed-prod-db.ts --confirm=<db-host> --with-demo-users
 *
 * The Coolify database host is internal to the VPS Docker network. From a
 * local machine, open a tunnel first, for example:
 *   ssh -N -L 6543:noxeaeuxfreq0axa9unpew5r:5432 root@<vps>
 * then use postgresql://postgres:<password>@localhost:6543/postgres
 * with --via-tunnel.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const serverDir = path.join(repoRoot, "apps", "server");
const requireFromDb = createRequire(
  path.join(repoRoot, "packages", "db", "package.json"),
);
type SqlClient = {
  <T = unknown[]>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
};
const postgres = requireFromDb("postgres") as unknown as (
  connection: string,
  options?: Record<string, unknown>,
) => SqlClient;

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseFlags(argv: string[]) {
  const flags = new Map<string, string | true>();
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    flags.set(key, rest.length > 0 ? rest.join("=") : true);
  }
  return flags;
}

const flags = parseFlags(process.argv);
if (flags.has("help")) {
  console.log(
    "Usage: bun scripts/seed-prod-db.ts --confirm=<db-host> [--via-tunnel] [--with-demo-users]",
  );
  process.exit(0);
}

const url = process.env.PROD_DATABASE_URL;
if (!url) fail("PROD_DATABASE_URL is required (do not use DATABASE_URL)");

let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  fail("PROD_DATABASE_URL is not a valid URL");
}
if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
  fail("PROD_DATABASE_URL must be a postgres:// or postgresql:// URL");
}

const host = parsed.hostname.toLowerCase();
const viaTunnel = flags.has("via-tunnel");
const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
if (loopback && !viaTunnel) {
  fail(
    "refusing a loopback database host; pass --via-tunnel only when the SSH tunnel targets production",
  );
}
if (/test/i.test(parsed.pathname)) {
  fail("refusing a database whose name contains 'test'");
}

const expectedHost = (
  flags.get("confirm") as string | undefined
)?.toLowerCase();
if (!expectedHost) {
  fail(`pass --confirm=${host} so the target is explicit`);
}
if (expectedHost !== host) {
  fail(`confirmation mismatch: expected --confirm=${host}`);
}

const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
if (adminPassword.length < 12) {
  fail("SEED_ADMIN_PASSWORD is required and must be at least 12 characters");
}

const withDemoUsers = flags.has("with-demo-users");
if (withDemoUsers) {
  for (const name of ["SEED_TUTOR_PASSWORD", "SEED_STUDENT_PASSWORD"]) {
    if ((process.env[name] ?? "").length < 12) {
      fail(`${name} is required and must be at least 12 characters`);
    }
  }
}

const ssl =
  process.env.PROD_DB_SSL === "require" || /sslmode=require/.test(url)
    ? ("require" as const)
    : false;

const sql = postgres(url, { max: 1, ssl, connect_timeout: 15 });

try {
  const [migration] = await sql<
    { count: number }[]
  >`select count(*)::int as count from drizzle.__drizzle_migrations`;
  if (migration.count === 0) {
    fail(
      "no migrations applied; run bun run db:migrate against this database first",
    );
  }

  const [users] = await sql<
    { count: number }[]
  >`select count(*)::int as count from "user"`;
  console.log(`Target: ${host}${parsed.pathname}`);
  console.log(`Applied migrations: ${migration.count}`);
  console.log(`Existing users: ${users.count}`);

  if (users.count > 0 && process.env.ALLOW_NONEMPTY_PROD_SEED !== "true") {
    fail(
      "database already has users; set ALLOW_NONEMPTY_PROD_SEED=true only if an additive seed is intended",
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}

console.log(
  withDemoUsers
    ? "Seeding defaults plus demo tutor and students."
    : "Seeding defaults only (no demo tutor or students).",
);

const seedArgs = ["run", "seed"];
if (!withDemoUsers) seedArgs.push("--defaults-only");

const result = spawnSync("bun", seedArgs, {
  cwd: serverDir,
  stdio: "inherit",
  env: {
    ...process.env,
    // NODE_ENV=development avoids the production-only env validation that a
    // developer terminal cannot satisfy (verified email sender, private R2,
    // scheduler, payment allowlists). The seed itself is the same code path.
    NODE_ENV: process.env.SEED_NODE_ENV ?? "development",
    DATABASE_URL: url,
    SEED_ALLOWED_IN_PROD: "true",
  },
});

if (result.status !== 0) {
  fail(`seed exited with code ${result.status ?? "unknown"}`);
}

const verify = postgres(url, { max: 1, ssl, connect_timeout: 15 });
try {
  const [users] = await verify<
    { count: number }[]
  >`select count(*)::int as count from "user"`;
  console.log(`Seed finished. Users now: ${users.count}`);
} finally {
  await verify.end({ timeout: 5 });
}
