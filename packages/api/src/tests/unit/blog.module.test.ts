import { describe, expect, test } from "bun:test";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../audit/audit.service";
import type { StoragePort } from "../../lib/storage";
import type { BlogHandler } from "../../modules/blog/blog.handler";
import { createBlogModule } from "../../modules/blog";
import { createBlogRouter } from "../../modules/blog/blog.router";

const handler = new Proxy(
  {},
  { get: () => () => ({}) },
) as unknown as BlogHandler;

describe("blog module wiring", () => {
  test("constructs repo, service, and handler from dependencies", () => {
    const blogModule = createBlogModule({
      db: {} as DbType,
      storage: {} as StoragePort,
      audit: {} as AuditPort,
    });
    expect(blogModule.repo).toBeDefined();
    expect(blogModule.service).toBeDefined();
    expect(blogModule.handler).toBeDefined();
  });

  test("exposes admin and public blog procedures", () => {
    const router = createBlogRouter(handler);
    expect(Object.keys(router.adminBlog.categories)).toEqual([
      "list",
      "create",
      "update",
      "delete",
      "reorder",
    ]);
    expect(Object.keys(router.publicContent.blog)).toEqual([
      "list",
      "get",
      "categories",
      "sitemap",
    ]);
    expect(Object.keys(router.adminBlog)).toContain("saveVersion");
    expect(Object.keys(router.adminBlog)).toContain("registerMedia");
  });
});
