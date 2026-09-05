import { describe, expect, test, beforeEach } from "bun:test";
import {
  renderExposition,
  recordRequest,
  getMetrics,
  _resetForTest,
} from "../../lib/metrics";

describe("metrics exposition", () => {
  beforeEach(() => {
    _resetForTest();
  });

  test("emits HELP/TYPE + request counter", () => {
    const out = renderExposition();
    expect(out).toContain("# HELP http_requests_total");
    expect(out).toContain("# TYPE http_requests_total counter");
  });

  test("counter carries path, method, status and the single-instance label", () => {
    recordRequest("/rpc/booking.create", 42, "POST", 200);
    const out = renderExposition();
    expect(out).toContain(
      'http_requests_total{path="/rpc/booking.create",method="POST",status="200",instance="single"} 1',
    );
  });

  test("histogram buckets, sum and count are emitted", () => {
    recordRequest("/health", 7, "GET", 200);
    recordRequest("/health", 1200, "GET", 200);
    const out = renderExposition();
    expect(out).toContain("# HELP http_request_duration_ms");
    expect(out).toContain("# TYPE http_request_duration_ms histogram");
    expect(out).toContain(
      'http_request_duration_ms_bucket{path="/health",method="GET",status="200",instance="single",le="10"} 1',
    );
    expect(out).toContain(
      'http_request_duration_ms_bucket{path="/health",method="GET",status="200",instance="single",le="+Inf"} 2',
    );
    expect(out).toContain(
      'http_request_duration_ms_sum{path="/health",method="GET",status="200",instance="single"} 1207',
    );
    expect(out).toContain(
      'http_request_duration_ms_count{path="/health",method="GET",status="200",instance="single"} 2',
    );
  });

  test("getMetrics aggregates one path across methods", () => {
    recordRequest("/rpc/mixed", 100, "GET", 200);
    recordRequest("/rpc/mixed", 300, "POST", 500);
    const metrics = getMetrics();
    expect(metrics["/rpc/mixed"]?.count).toBe(2);
    expect(metrics["/rpc/mixed"]?.avgMs).toBe(200);
  });

  test("dlq gauge is omitted without input and rendered with it", () => {
    expect(renderExposition()).not.toContain("dlq_fresh_depth");
    const out = renderExposition({ dlqDepth: 3 });
    expect(out).toContain("# HELP dlq_fresh_depth");
    expect(out).toContain("# TYPE dlq_fresh_depth gauge");
    expect(out).toContain('dlq_fresh_depth{instance="single"} 3');
  });

  test("breaker gauge renders every known state by name", () => {
    expect(renderExposition({ breakers: {} })).toContain(
      "# TYPE breaker_state gauge",
    );
    const out = renderExposition({
      breakers: {
        resend: "open",
        "google-meet": "closed",
        xendit: "half-open",
      },
    });
    expect(out).toContain(
      'breaker_state{name="google-meet",instance="single"} 0',
    );
    expect(out).toContain('breaker_state{name="xendit",instance="single"} 1');
    expect(out).toContain('breaker_state{name="resend",instance="single"} 2');
  });

  test("label values with quotes are escaped", () => {
    recordRequest('/weird"path', 5, "GET", 200);
    const out = renderExposition();
    expect(out).toContain('path="/weird\\"path"');
  });
});
