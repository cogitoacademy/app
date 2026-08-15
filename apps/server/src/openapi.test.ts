import { describe, expect, test } from "bun:test";

import { enrichOpenAPISpec } from "./openapi";
import { openApiAccessDenied } from "@cogito-app/api/lib/request-id";

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

describe("OpenAPI access gate", () => {
  test("returns 404 in production regardless of session", () => {
    const prodAuthed = openApiAccessDenied("production", true);
    expect(prodAuthed).not.toBeNull();
    expect(prodAuthed!.status).toBe(404);

    const prodAnon = openApiAccessDenied("production", false);
    expect(prodAnon).not.toBeNull();
    expect(prodAnon!.status).toBe(404);
  });

  test("requires an authenticated session outside production", () => {
    const anon = openApiAccessDenied("development", false);
    expect(anon).not.toBeNull();
    expect(anon!.status).toBe(401);

    expect(openApiAccessDenied("development", true)).toBeNull();
    expect(openApiAccessDenied("test", true)).toBeNull();
  });
});
