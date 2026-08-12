process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.BETTER_AUTH_SECRET ??= "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
process.env.PAYMENT_WEBHOOK_SECRET ??= "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function getDatabaseName(databaseUrl: string) {
  try {
    return new URL(databaseUrl).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function isSafeTestDatabase(databaseUrl: string) {
  const databaseName = getDatabaseName(databaseUrl).toLowerCase();
  return databaseName.includes("test");
}

if (!isSafeTestDatabase(process.env.DATABASE_URL)) {
  throw new Error(
    [
      "Refusing to run tests against a non-test database.",
      `DATABASE_URL currently targets '${getDatabaseName(process.env.DATABASE_URL)}'.`,
      "Point DATABASE_URL to a dedicated test database whose name includes 'test'.",
    ].join(" "),
  );
}
