import { describe, test, expect } from "bun:test";
import { recordRequest, getMetrics } from "../../lib/metrics";

describe("Metrics", () => {
  test("records a request and retrieves it", () => {
    recordRequest("/api/test", 50);
    const metrics = getMetrics();
    expect(metrics["/api/test"]).toBeDefined();
    expect(metrics["/api/test"].count).toBe(1);
    expect(metrics["/api/test"].avgMs).toBe(50);
    expect(metrics["/api/test"].path).toBe("/api/test");
  });

  test("accumulates counts for the same path", () => {
    recordRequest("/api/accumulate", 100);
    recordRequest("/api/accumulate", 200);
    const metrics = getMetrics();
    expect(metrics["/api/accumulate"].count).toBe(2);
    expect(metrics["/api/accumulate"].avgMs).toBe(150);
  });

  test("tracks different paths independently", () => {
    recordRequest("/api/a", 10);
    recordRequest("/api/b", 20);
    const metrics = getMetrics();
    expect(metrics["/api/a"].count).toBe(1);
    expect(metrics["/api/b"].count).toBe(1);
    expect(metrics["/api/a"].avgMs).toBe(10);
    expect(metrics["/api/b"].avgMs).toBe(20);
  });

  test("caps duration array at 1000 entries and computes correct rolling avgMs", () => {
    for (let i = 0; i < 1050; i++) {
      recordRequest("/api/capped", i);
    }
    const metrics = getMetrics();
    expect(metrics["/api/capped"].count).toBe(1050);
    expect(metrics["/api/capped"].avgMs).toBeGreaterThanOrEqual(0);
    const durations = [];
    for (let i = 0; i < 1050; i++) durations.push(i);
    const expectedAvg = durations.slice(50).reduce((a, b) => a + b, 0) / 1000;
    expect(metrics["/api/capped"].avgMs).toBeCloseTo(expectedAvg, 0);
  });

  test("handles zero-duration requests", () => {
    recordRequest("/api/zero", 0);
    const metrics = getMetrics();
    expect(metrics["/api/zero"].avgMs).toBe(0);
  });
});
