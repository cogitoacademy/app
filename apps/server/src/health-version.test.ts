import { describe, expect, mock, test } from "bun:test";

// Hermetic: stub the DB/Redis-backed health check so the route runs without
// opening real connections (same pattern as webhook-idempotency-ttl.test.ts).
// The version field is what this suite covers; healthCheck itself is covered
// by packages/api/src/tests/unit/db-health.test.ts.
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

/**
 * The /health response must surface the deployed image sha so the CD
 * pipeline can verify the *deployed* container (not just "some container
 * is up"). `version` = `process.env.GIT_SHA` when set (injected by the
 * Dockerfile `ARG GIT_SHA` / `ENV GIT_SHA`), else `"dev"`.
 */
async function getHealthBody(): Promise<Record<string, unknown>> {
  const res = await createServer().handle(
    new Request("http://localhost/health"),
  );
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /health version field", () => {
  test("reports the deployed image sha when GIT_SHA is set", async () => {
    const previous = process.env.GIT_SHA;
    process.env.GIT_SHA = "abc123";
    try {
      const body = await getHealthBody();
      expect(body.version).toBe("abc123");
    } finally {
      if (previous === undefined) delete process.env.GIT_SHA;
      else process.env.GIT_SHA = previous;
    }
  });

  test("falls back to dev when GIT_SHA is unset", async () => {
    const previous = process.env.GIT_SHA;
    delete process.env.GIT_SHA;
    try {
      const body = await getHealthBody();
      expect(body.version).toBe("dev");
    } finally {
      if (previous !== undefined) process.env.GIT_SHA = previous;
    }
  });
});
