import { describe, expect, test, beforeEach } from "bun:test";
import {
  normalizeMetricsPath,
  recordRequest,
  renderExposition,
  getMetrics,
  _resetForTest,
} from "../../lib/metrics";

describe("metrics path normalization", () => {
  beforeEach(() => {
    _resetForTest();
  });

  test("knowledge-bank file URLs with different IDs collapse to one series", () => {
    recordRequest("/content/knowledge-bank/abc123/file", 10, "GET", 200);
    recordRequest("/content/knowledge-bank/zzz999/file", 20, "GET", 200);
    const metrics = getMetrics();
    expect(metrics["/content/knowledge-bank/:id/file"]?.count).toBe(2);
    expect(metrics["/content/knowledge-bank/abc123/file"]).toBeUndefined();
    expect(metrics["/content/knowledge-bank/zzz999/file"]).toBeUndefined();
    expect(renderExposition()).toContain(
      'http_requests_total{path="/content/knowledge-bank/:id/file",method="GET",status="200",instance="single"} 2',
    );
  });

  test("uploads paths collapse while depth is preserved", () => {
    recordRequest("/uploads/avatar.png", 5, "GET", 200);
    recordRequest("/uploads/other.png", 7, "GET", 200);
    recordRequest("/uploads/user-1/a.png", 5, "GET", 200);
    recordRequest("/uploads/user-2/b.png", 5, "GET", 200);
    const metrics = getMetrics();
    expect(metrics["/uploads/:id"]?.count).toBe(2);
    expect(metrics["/uploads/:id/:id"]?.count).toBe(2);
    expect(metrics["/uploads/avatar.png"]).toBeUndefined();
    expect(metrics["/uploads/user-1/a.png"]).toBeUndefined();
  });

  test("/rpc and static paths stay byte-identical", () => {
    expect(normalizeMetricsPath("/rpc/booking.create")).toBe(
      "/rpc/booking.create",
    );
    expect(normalizeMetricsPath("/health")).toBe("/health");
    expect(normalizeMetricsPath("/metrics")).toBe("/metrics");
    expect(normalizeMetricsPath("/")).toBe("/");
    expect(normalizeMetricsPath("/uploads")).toBe("/uploads");
    expect(normalizeMetricsPath("/uploads/")).toBe("/uploads/");
    expect(normalizeMetricsPath("/content/knowledge-bank")).toBe(
      "/content/knowledge-bank",
    );
    expect(normalizeMetricsPath("/content/knowledge-bank/")).toBe(
      "/content/knowledge-bank/",
    );
    recordRequest("/rpc/booking.create", 5, "POST", 200);
    expect(getMetrics()["/rpc/booking.create"]?.count).toBe(1);
  });

  test("already-normalized input is stable", () => {
    expect(normalizeMetricsPath("/content/knowledge-bank/:id/file")).toBe(
      "/content/knowledge-bank/:id/file",
    );
    expect(normalizeMetricsPath("/uploads/:id")).toBe("/uploads/:id");
    expect(normalizeMetricsPath("/uploads/:id/:id")).toBe("/uploads/:id/:id");
  });

  test("normalized series still split by method and status", () => {
    recordRequest("/content/knowledge-bank/a/file", 10, "GET", 200);
    recordRequest("/content/knowledge-bank/b/file", 10, "POST", 500);
    const out = renderExposition();
    expect(out).toContain(
      'http_requests_total{path="/content/knowledge-bank/:id/file",method="GET",status="200",instance="single"} 1',
    );
    expect(out).toContain(
      'http_requests_total{path="/content/knowledge-bank/:id/file",method="POST",status="500",instance="single"} 1',
    );
    expect(getMetrics()["/content/knowledge-bank/:id/file"]?.count).toBe(2);
  });

  test("error-path recording yields a status 500 series", () => {
    // Mirrors what the server onError hook records for a thrown 500
    // (numeric set.status, else 500 for the unhandled-error path).
    recordRequest("/rpc/booking.create", 12, "POST", 500);
    expect(renderExposition()).toContain(
      'http_requests_total{path="/rpc/booking.create",method="POST",status="500",instance="single"} 1',
    );
  });
});
