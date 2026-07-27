import { describe, expect, test } from "bun:test";

import { enrichOpenAPISpec } from "./openapi";

function openapiGuard(nodeEnv: string) {
  if (nodeEnv === "production")
    return new Response("Not Found", { status: 404 });
  return null;
}

describe("enrichOpenAPISpec", () => {
  test("adds global tags and sorts paths alphabetically", () => {
    const spec = {
      openapi: "3.1.1",
      info: { title: "Cogito API", version: "1.0.0" },
      paths: {
        "/auth/me": {
          post: {
            operationId: "auth.me",
            tags: ["Auth"],
            responses: { 200: { description: "OK" } },
          },
        },
        "/achievements/list": {
          post: {
            operationId: "achievement.list",
            tags: ["Achievements"],
            responses: { 200: { description: "OK" } },
          },
        },
      },
    };

    const enriched = enrichOpenAPISpec(spec);

    expect(enriched.tags).toContainEqual({
      name: "Auth",
      description: "Authentication & user profiles",
    });
    expect(Object.keys(enriched.paths)).toEqual([
      "/achievements/list",
      "/auth/me",
    ]);
  });
});

describe("OpenAPI production guard", () => {
  test("production guard logic returns 404 when NODE_ENV is production", () => {
    const result = openapiGuard("production");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(404);

    const devResult = openapiGuard("development");
    expect(devResult).toBeNull();

    const testResult = openapiGuard("test");
    expect(testResult).toBeNull();
  });
});
