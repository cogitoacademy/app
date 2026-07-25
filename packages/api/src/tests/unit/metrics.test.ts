import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { recordRequest, getMetrics, _resetForTest } from "../../lib/metrics";

describe("Metrics", () => {
  test("records a request and retrieves it", () => {
    _resetForTest();
    recordRequest("/api/test", 50);
    const metrics = getMetrics();
    expect(metrics["/api/test"]).toBeDefined();
    expect(metrics["/api/test"].count).toBe(1);
    expect(metrics["/api/test"].avgMs).toBe(50);
    expect(metrics["/api/test"].path).toBe("/api/test");
  });

  test("accumulates counts for the same path", () => {
    _resetForTest();
    recordRequest("/api/accumulate", 100);
    recordRequest("/api/accumulate", 200);
    const metrics = getMetrics();
    expect(metrics["/api/accumulate"].count).toBe(2);
    expect(metrics["/api/accumulate"].avgMs).toBe(150);
  });

  test("tracks different paths independently", () => {
    _resetForTest();
    recordRequest("/api/a", 10);
    recordRequest("/api/b", 20);
    const metrics = getMetrics();
    expect(metrics["/api/a"].count).toBe(1);
    expect(metrics["/api/b"].count).toBe(1);
    expect(metrics["/api/a"].avgMs).toBe(10);
    expect(metrics["/api/b"].avgMs).toBe(20);
  });

  test("caps duration array at 1000 entries and computes correct rolling avgMs", () => {
    _resetForTest();
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
    _resetForTest();
    recordRequest("/api/zero", 0);
    const metrics = getMetrics();
    expect(metrics["/api/zero"].avgMs).toBe(0);
  });

  describe("TTL eviction", () => {
    const realDateNow = Date.now;
    let now: number;

    beforeEach(() => {
      _resetForTest();
      now = 1_000_000;
      Date.now = () => now;
    });

    afterEach(() => {
      Date.now = realDateNow;
    });

    test("evicts stale paths after TTL expires", () => {
      recordRequest("/api/stale", 100);
      now = 1_000_000 + 11 * 60 * 1000;
      recordRequest("/api/fresh", 200);
      const metrics = getMetrics();
      expect(metrics["/api/stale"]).toBeUndefined();
      expect(metrics["/api/fresh"]).toBeDefined();
      expect(metrics["/api/fresh"].count).toBe(1);
    });

    test("does not evict paths within TTL", () => {
      recordRequest("/api/recent", 100);
      now = 1_000_000 + 5 * 60 * 1000;
      recordRequest("/api/recent", 150);
      const metrics = getMetrics();
      expect(metrics["/api/recent"]).toBeDefined();
      expect(metrics["/api/recent"].count).toBe(2);
    });

    test("getMetrics triggers cleanup of stale paths", () => {
      recordRequest("/api/stale-metrics", 100);
      now = 1_000_000 + 11 * 60 * 1000;
      const metrics = getMetrics();
      expect(metrics["/api/stale-metrics"]).toBeUndefined();
    });

    test("does not add lastAccess entry for paths beyond MAX_PATHS", () => {
      _resetForTest();
      for (let i = 0; i < 201; i++) {
        recordRequest(`/api/path-${i}`, i);
      }
      recordRequest("/api/extra", 1);
      const metrics = getMetrics();
      expect(metrics["/api/extra"]).toBeUndefined();
    });

    test("cleans up orphaned lastAccess entries", () => {
      _resetForTest();
      const realDateNow = Date.now;
      let now = 1_000_000;
      Date.now = () => now;

      for (let i = 0; i < 5; i++) {
        recordRequest(`/api/orphan-${i}`, i);
      }
      now = 1_000_000 + 11 * 60 * 1000;
      recordRequest("/api/keep", 10);

      const metrics = getMetrics();
      expect(metrics["/api/keep"]).toBeDefined();
      for (let i = 0; i < 5; i++) {
        expect(metrics[`/api/orphan-${i}`]).toBeUndefined();
      }

      Date.now = realDateNow;
    });
  });
});
