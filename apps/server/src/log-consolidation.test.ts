import { describe, expect, mock, test, beforeEach, afterEach } from "bun:test";

// Hermetic: stub the DB/Redis-backed health check so the route runs without
// opening real connections (same pattern as health-version.test.ts).
mock.module("@cogito-app/api/lib/db-health", () => ({
  healthCheck: async () => ({
    status: "ok",
    checks: { database: "ok" },
    timestamp: new Date().toISOString(),
  }),
  healthStatus: (status: string) => (status === "ok" ? 200 : 503),
}));

const { createServer } = await import("./routes");

/**
 * Consolidation contract: every HTTP request emits exactly ONE structured
 * request_complete line carrying method/path/status/requestId/durationMs.
 * The evlog plugin's wide-event line must be suppressed (no per-request
 * line with method/path/status/environment from evlog), and the previous
 * bare request_complete line (no method/path/status) must no longer exist.
 */
describe("consolidated request logging", () => {
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
          captured.unshift({
            level,
            entry: JSON.parse(args[0] as string) as Record<string, unknown>,
          });
        } catch {
          captured.unshift({ level, entry: { raw: args[0] } });
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

  test("GET /health emits exactly one request_complete line with full metadata", async () => {
    const res = await createServer().handle(
      new Request("http://localhost/health"),
    );
    expect(res.status).toBe(200);

    const completeLines = captured.filter(
      (c) => c.entry.action === "request_complete",
    );
    expect(completeLines).toHaveLength(1);

    const entry = completeLines[0]!.entry;
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/health");
    expect(entry.status).toBe(200);
    expect(entry.requestId).toBeDefined();
    expect(typeof entry.requestId).toBe("string");
    expect(entry.durationMs).toBeDefined();
    expect(typeof entry.durationMs).toBe("number");
  });

  test("no evlog wide-event line is emitted per request", async () => {
    await createServer().handle(new Request("http://localhost/health"));

    // evlog's wide-event line carries method+path+status+environment together
    // and no action field; the consolidated app line has action:
    // "request_complete" and no environment. A line with both `environment`
    // and `path` is an evlog wide-event line — it must not exist.
    const evlogLines = captured.filter(
      (c) =>
        typeof c.entry.environment === "string" &&
        typeof c.entry.path === "string",
    );
    expect(evlogLines).toHaveLength(0);
  });

  test("request_complete honors an inbound x-request-id", async () => {
    await createServer().handle(
      new Request("http://localhost/health", {
        headers: { "x-request-id": "req-client-42" },
      }),
    );

    const completeLines = captured.filter(
      (c) => c.entry.action === "request_complete",
    );
    expect(completeLines).toHaveLength(1);
    expect(completeLines[0]!.entry.requestId).toBe("req-client-42");
  });

  test("rpc_error lines carry requestId/path/method for correlation", async () => {
    // /rpc/auth/me with a nonsensical body fails oRPC validation, which
    // routes through the onError interceptor — the same code path used for
    // procedure errors. The line must be correlatable back to the request.
    await createServer().handle(
      new Request("http://localhost/rpc/auth/me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: 12345 }),
      }),
    );

    const rpcErrors = captured.filter((c) => c.entry.action === "rpc_error");
    expect(rpcErrors.length).toBeGreaterThan(0);
    for (const line of rpcErrors) {
      expect(typeof line.entry.requestId).toBe("string");
      expect(line.entry.requestId).toMatch(/^req_/);
      expect(line.entry.path).toBe("/rpc/auth/me");
      expect(line.entry.method).toBe("POST");
      expect(line.entry.error).toBeDefined();
    }
  });
});
