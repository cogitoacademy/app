import { describe, test, expect, mock } from "bun:test";

mock.module("@cogito-app/env/server", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NODE_ENV: "test",
    DB_SSL_REJECT_UNAUTHORIZED: false,
  },
}));

mock.module("pg", () => {
  return {
    Pool: class {
      on(_event: string, _cb: Function) {}
    },
  };
});

mock.module("drizzle-orm/node-postgres", () => ({
  drizzle: (_pool: any, opts: any) => ({ schema: opts?.schema }),
}));

describe("db", () => {
  test("exports createDb function", async () => {
    const { createDb } = await import("@cogito-app/db");
    expect(typeof createDb).toBe("function");
  });

  test("createDb returns a drizzle instance with schema", async () => {
    const { createDb } = await import("@cogito-app/db");
    const db = createDb();
    expect(db).toBeDefined();
    expect(db.schema).toBeDefined();
  });

  test("exports db singleton", async () => {
    const mod = await import("@cogito-app/db");
    expect(mod.db).toBeDefined();
  });

  test("warns in production when DB_SSL_REJECT_UNAUTHORIZED is false", async () => {
    const originalWarn = console.warn;
    const warnCalls: string[] = [];
    console.warn = (...args: any[]) => {
      warnCalls.push(args.join(" "));
    };

    mock.module("@cogito-app/env/server", () => ({
      env: {
        DATABASE_URL: "postgresql://test:test@localhost:5432/test",
        NODE_ENV: "production",
        DB_SSL_REJECT_UNAUTHORIZED: false,
      },
    }));

    mock.module("pg", () => ({
      Pool: class {
        on(_event: string, _cb: Function) {}
      },
    }));

    mock.module("drizzle-orm/node-postgres", () => ({
      drizzle: (_pool: any, opts: any) => ({ schema: opts?.schema }),
    }));

    await import("@cogito-app/db?prod_ssl_warn=" + Date.now());
    expect(warnCalls.length).toBeGreaterThanOrEqual(1);
    expect(warnCalls[0]).toContain("DB_SSL_REJECT_UNAUTHORIZED");

    console.warn = originalWarn;
  });
});
