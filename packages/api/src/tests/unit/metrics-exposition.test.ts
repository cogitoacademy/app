import { describe, expect, test, beforeEach } from "bun:test";
import {
  renderExposition,
  recordRequest,
  getMetrics,
  _resetForTest,
  recordPaymentIntegrity,
  recordPaymentReconciliation,
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
        midtrans: "half-open",
      },
    });
    expect(out).toContain(
      'breaker_state{name="google-meet",instance="single"} 0',
    );
    expect(out).toContain('breaker_state{name="midtrans",instance="single"} 1');
    expect(out).toContain('breaker_state{name="resend",instance="single"} 2');
  });

  test("label values with quotes are escaped", () => {
    recordRequest('/weird"path', 5, "GET", 200);
    const out = renderExposition();
    expect(out).toContain('path="/weird\\"path"');
  });

  test("app_info carries the injected version, falling back to dev", () => {
    const fallback = renderExposition();
    expect(fallback).toContain("# HELP app_info");
    expect(fallback).toContain("# TYPE app_info gauge");
    expect(fallback).toContain(
      'app_info{version="dev",provider="stub",provider_mode="none"} 1',
    );
    expect(renderExposition({ version: "abc123def" })).toContain(
      'app_info{version="abc123def",provider="stub",provider_mode="none"} 1',
    );
    // Blank versions fall back to dev (same safe default as the route caller).
    expect(renderExposition({ version: "  " })).toContain(
      'app_info{version="dev",provider="stub",provider_mode="none"} 1',
    );
  });

  test("app_info labels the injected payment provider and mode", () => {
    expect(
      renderExposition({
        version: "abc123def",
        provider: "midtrans",
        providerMode: "test",
      }),
    ).toContain(
      'app_info{version="abc123def",provider="midtrans",provider_mode="test"} 1',
    );
    expect(
      renderExposition({
        version: "abc123def",
        provider: "midtrans",
        providerMode: "live",
      }),
    ).toContain(
      'app_info{version="abc123def",provider="midtrans",provider_mode="live"} 1',
    );
    expect(
      renderExposition({
        version: "abc123def",
        provider: "stub",
        providerMode: "none",
      }),
    ).toContain(
      'app_info{version="abc123def",provider="stub",provider_mode="none"} 1',
    );
    // The stub provider has no mode concept: an explicitly passed mode is
    // ignored so the dashboards contract (stub ⇒ none) always holds.
    expect(
      renderExposition({
        version: "abc123def",
        provider: "stub",
        providerMode: "test",
      }),
    ).toContain(
      'app_info{version="abc123def",provider="stub",provider_mode="none"} 1',
    );
  });

  test("app_info defaults to stub/none without injection (env-free)", () => {
    // The exposition no longer reads process env; the route caller injects
    // provider/mode/version from validated env. Bare calls use safe defaults.
    expect(renderExposition()).toContain(
      'app_info{version="dev",provider="stub",provider_mode="none"} 1',
    );
    expect(
      renderExposition({ provider: "midtrans", providerMode: "test" }),
    ).toContain('provider="midtrans",provider_mode="test"');
    expect(
      renderExposition({ provider: "midtrans", providerMode: "live" }),
    ).toContain('provider="midtrans",provider_mode="live"');
    expect(renderExposition({ provider: "stub" })).toContain(
      'provider="stub",provider_mode="none"',
    );
  });

  test("renders payment integrity and reconciliation counters", () => {
    recordPaymentIntegrity("midtrans", "provider_mismatch");
    recordPaymentIntegrity("midtrans", "amount_mismatch");
    recordPaymentIntegrity("midtrans", "currency_mismatch");
    recordPaymentIntegrity("midtrans", "partial_refund");
    recordPaymentReconciliation("midtrans", "reconciled");
    recordPaymentReconciliation("midtrans", "pending");
    recordPaymentReconciliation("midtrans", "failed");

    const out = renderExposition();

    expect(out).toContain(
      'payment_integrity_events_total{provider="midtrans",type="provider_mismatch"} 1',
    );
    expect(out).toContain(
      'payment_integrity_events_total{provider="midtrans",type="partial_refund"} 1',
    );
    expect(out).toContain(
      'payment_reconciliation_total{provider="midtrans",outcome="reconciled"} 1',
    );
    expect(out).toContain(
      'payment_reconciliation_total{provider="midtrans",outcome="failed"} 1',
    );
  });
});
