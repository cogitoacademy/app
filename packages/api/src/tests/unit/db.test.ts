import { describe, test, expect, mock } from "bun:test";

mock.module("@cogito-app/env/server", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NODE_ENV: "test",
    DB_SSL_REJECT_UNAUTHORIZED: false,
  },
}));

mock.module("postgres", () => {
  return function postgres() {
    return {};
  };
});

mock.module("drizzle-orm/postgres-js", () => ({
  drizzle: (_client: any, opts: any) => ({ schema: opts?.schema }),
}));

describe("db", () => {
  test("exports createDb function", async () => {
    const { createDb } = await import("@cogito-app/db");
    expect(typeof createDb).toBe("function");
  });

  test("createDb returns a drizzle instance", async () => {
    const { createDb } = await import("@cogito-app/db");
    const db = createDb();
    expect(db).toBeDefined();
    expect(typeof db.select).toBe("function");
  });

  test("exports db singleton", async () => {
    const mod = await import("@cogito-app/db");
    expect(mod.db).toBeDefined();
  });
});
