import { describe, test, expect, mock, afterEach } from "bun:test";
import { db } from "@cogito-app/db";

describe("healthCheck", () => {
  afterEach(() => {
    mock.restore();
  });

  test("returns ok when database responds quickly", async () => {
    const { healthCheck } = await import("../../lib/db-health");
    const result = await healthCheck();
    expect(result.checks.database).toBe("ok");
    expect(result.status).toBe("ok");
    expect(result.timestamp).toBeDefined();
  });

  test("returns error when database throws", async () => {
    const originalExecute = db.execute;
    (db as any).execute = mock(async () => {
      throw new Error("connection refused");
    });

    const { healthCheck } = await import("../../lib/db-health");
    const result = await healthCheck();
    expect(result.checks.database).toBe("error");
    expect(result.status).toBe("error");

    (db as any).execute = originalExecute;
  });

  test("returns degraded when database is slow", async () => {
    const originalExecute = db.execute;
    const originalPerformance = globalThis.performance;
    let nowCallCount = 0;

    (db as any).execute = mock(async () => [{ result: 1 }]);

    globalThis.performance = {
      ...originalPerformance,
      now: () => {
        nowCallCount++;
        if (nowCallCount === 1) return 0;
        if (nowCallCount === 2) return 1500;
        return originalPerformance.now();
      },
    } as Performance;

    const { healthCheck } = await import("../../lib/db-health");
    const result = await healthCheck();
    expect(result.checks.database).toBe("degraded");
    expect(result.status).toBe("degraded");

    (db as any).execute = originalExecute;
    globalThis.performance = originalPerformance;
  });
});
