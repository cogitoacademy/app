import { describe, expect, mock, test, beforeEach, afterEach } from "bun:test";

// Hermetic: stub the DB/Redis-backed health check so the route runs without
// opening real connections (same pattern as log-consolidation.test.ts).
mock.module("@cogito-app/api/lib/db-health", () => ({
  healthCheck: async () => ({
    status: "ok",
    checks: { database: "ok" },
    timestamp: new Date().toISOString(),
  }),
  healthStatus: (status: string) => (status === "ok" ? 200 : 503),
  // Complete surface: health-metrics.ts named-imports these for /metrics
  // (P1). A partial mock breaks ESM linking for every importer in the
  // shared bun:test process with "Export named X not found".
  checkDlqHealth: async () => 0,
  checkCircuitBreakers: async () => ({}),
}));

const { createServer } = await import("./routes/create-server");

describe("trace middleware seeding (T1)", () => {
  let captured: { level: string; entry: Record<string, unknown> }[];
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    captured = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    const capture =
      (level: string) =>
      (...args: unknown[]) => {
        try {
          captured.push({
            level,
            entry: JSON.parse(args[0] as string) as Record<string, unknown>,
          });
        } catch {
          captured.push({ level, entry: { raw: args[0] } });
        }
      };
    console.log = capture("info");
    console.error = capture("error");
    console.warn = capture("warn");
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  function completeLine() {
    const lines = captured.filter((c) => c.entry.action === "request_complete");
    expect(lines).toHaveLength(1);
    return lines[0]!.entry;
  }

  test("traceparent seeds the W3C trace-id, requestId stays req_*", async () => {
    const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const res = await createServer().handle(
      new Request("http://localhost/health", {
        headers: { traceparent: header },
      }),
    );
    expect(res.status).toBe(200);
    const entry = completeLine();
    expect(entry.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(entry.requestId).toMatch(/^req_/);
  });

  test("x-request-id doubles as traceId without traceparent", async () => {
    await createServer().handle(
      new Request("http://localhost/health", {
        headers: { "x-request-id": "req-client-7" },
      }),
    );
    const entry = completeLine();
    expect(entry.requestId).toBe("req-client-7");
    expect(entry.traceId).toBe("req-client-7");
  });

  test("a fresh req_* id seeds both fields when no headers arrive", async () => {
    await createServer().handle(new Request("http://localhost/health"));
    const entry = completeLine();
    expect(entry.requestId).toMatch(/^req_/);
    expect(entry.traceId).toBe(entry.requestId);
  });

  test("malformed traceparent falls back to the request id", async () => {
    await createServer().handle(
      new Request("http://localhost/health", {
        headers: {
          traceparent: "not-a-traceparent",
          "x-request-id": "req-fallback-9",
        },
      }),
    );
    const entry = completeLine();
    expect(entry.traceId).toBe("req-fallback-9");
  });
});
