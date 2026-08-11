import { describe, test, expect, mock, afterEach } from "bun:test";
import { InMemoryRedis } from "../../lib/redis";

mock.module("@cogito-app/env/server", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NODE_ENV: "test",
    DB_SSL_REJECT_UNAUTHORIZED: false,
  },
}));

mock.module("postgres", () => ({
  default: () => ({}),
}));

mock.module("drizzle-orm/postgres-js", () => ({
  drizzle: (_client: any, opts: any) => ({
    schema: opts?.schema,
    select: () => {},
  }),
}));

const mockExecute = mock(async () => [{ result: 1 }]);
mock.module("@cogito-app/db", () => ({
  db: { execute: mockExecute },
}));

describe("healthCheck", () => {
  afterEach(() => {
    mock.restore();
  });

  test("returns ok when database responds quickly", async () => {
    mockExecute.mockResolvedValue([{ result: 1 }]);
    const { healthCheck } = await import("../../lib/db-health");
    const result = await healthCheck();
    expect(result.checks.database).toBe("ok");
    expect(result.status).toBe("ok");
    expect(result.timestamp).toBeDefined();
  });

  test("returns error when database throws", async () => {
    mockExecute.mockRejectedValue(new Error("connection refused"));
    const { healthCheck } = await import("../../lib/db-health");
    const result = await healthCheck();
    expect(result.checks.database).toBe("error");
    expect(result.status).toBe("error");
  });

  test("includes redis status when redis client is provided", async () => {
    mockExecute.mockResolvedValue([{ result: 1 }]);
    const redis = new InMemoryRedis();
    const { healthCheck } = await import("../../lib/db-health");
    const result = await healthCheck(redis);
    expect(result.checks).toHaveProperty("database");
    expect(result.checks).toHaveProperty("redis");
    expect(result.checks.redis).toBe("ok");
  });

  test("reports error when redis ping fails", async () => {
    mockExecute.mockResolvedValue([{ result: 1 }]);
    const failingRedis = {
      ...new InMemoryRedis(),
      ping: async () => {
        throw new Error("connection refused");
      },
    };
    const { healthCheck } = await import("../../lib/db-health");
    const result = await healthCheck(failingRedis);
    expect(result.checks.redis).toBe("error");
  });

  test("omits redis status when no redis client provided", async () => {
    mockExecute.mockResolvedValue([{ result: 1 }]);
    const { healthCheck } = await import("../../lib/db-health");
    const result = await healthCheck();
    expect(result.checks).not.toHaveProperty("redis");
  });
});
