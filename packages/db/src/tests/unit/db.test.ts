import { describe, test, expect, mock } from "bun:test";

const mockEnv = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  NODE_ENV: "test",
  DB_SSL_REJECT_UNAUTHORIZED: false,
};

mock.module("@cogito-app/env/server", () => ({
  env: mockEnv,
}));

const postgresOptions: any[] = [];
mock.module("postgres", () => {
  return {
    default: function postgres(_url: string, options: any) {
      postgresOptions.push(options);
      return {};
    },
  };
});

mock.module("drizzle-orm/postgres-js", () => ({
  drizzle: (_client: any, opts: any) => ({
    schema: opts?.schema,
    select: () => undefined,
  }),
}));

describe("db", () => {
  test("exports createDb function", async () => {
    const { createDb } = await import("../../index");
    expect(typeof createDb).toBe("function");
  });

  test("createDb returns a drizzle instance", async () => {
    const { createDb } = await import("../../index");
    const db = createDb();
    expect(db).toBeDefined();
    expect(typeof db.select).toBe("function");
  });

  test("exports db singleton", async () => {
    const mod = await import("../../index");
    expect(mod.db).toBeDefined();
  });

  test("warns for insecure production SSL configuration", async () => {
    const { warnIfInsecureProductionSsl } = await import("../../index");
    expect(() =>
      warnIfInsecureProductionSsl("production", false),
    ).not.toThrow();
  });

  test("redacts sensitive development query parameters", async () => {
    const { createDb } = await import("../../index");
    mockEnv.NODE_ENV = "development";
    createDb();
    const onquery = postgresOptions.at(-1)?.onquery;
    expect(typeof onquery).toBe("function");

    expect(() =>
      onquery({
        sql: "select",
        params: [
          42,
          "person@example.com",
          "x".repeat(101),
          "sk_secret",
          "token-value",
          "plain",
        ],
      }),
    ).not.toThrow();
  });
});
