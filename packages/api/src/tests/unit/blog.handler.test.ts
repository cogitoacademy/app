import { describe, expect, mock, test } from "bun:test";

import { createBlogHandler } from "../../modules/blog/blog.handler";
import { BlogNotFoundError } from "../../modules/blog/blog.errors";

const context = { session: { user: { id: "admin-1" } } } as any;

function service(overrides: Record<string, unknown> = {}) {
  const names = [
    "listCategoriesAdmin",
    "listTutorOptions",
    "createCategory",
    "updateCategory",
    "deleteCategory",
    "reorderCategories",
    "listAdmin",
    "getAdmin",
    "createArticle",
    "updateArticle",
    "saveVersion",
    "publishVersion",
    "unpublishVersion",
    "archiveArticle",
    "replaceRelated",
    "replaceGallery",
    "registerMedia",
    "listPublic",
    "getPublic",
    "listPublicCategories",
    "sitemap",
  ];
  const spies = Object.fromEntries(
    names.map((name) => [name, mock(async () => ({ name }))]),
  );
  return { ...spies, ...overrides };
}

describe("blog admin handler", () => {
  test("delegates every admin method and passes the actor id", async () => {
    const blog = service();
    const handler = createBlogHandler(blog as any);

    await handler.listCategories();
    await handler.listTutors();
    await handler.createCategory({ input: { titleId: "a" } } as any);
    await handler.updateCategory({ input: { categoryId: "c" } } as any);
    await handler.deleteCategory({
      input: { categoryId: "c", expectedVersion: 1 },
    });
    await handler.reorderCategories({ input: { ids: ["a"] } } as any);
    await handler.list({ input: { limit: 20 } } as any);
    await handler.get({ input: { articleId: "a" } } as any);
    await handler.createArticle({ context, input: { categoryId: "c" } } as any);
    await handler.updateArticle({
      context,
      input: { articleId: "a" },
    } as any);
    await handler.saveVersion({ input: { articleId: "a" } } as any);
    await handler.publishVersion({
      context,
      input: { articleId: "a" },
    } as any);
    await handler.unpublishVersion({
      context,
      input: { articleId: "a" },
    } as any);
    await handler.archiveArticle({
      context,
      input: { articleId: "a" },
    } as any);
    await handler.replaceRelated({ input: { articleId: "a" } } as any);
    await handler.replaceGallery({
      input: {
        articleId: "a",
        expectedVersion: 2,
        images: [{ mediaId: "m1" }, { mediaId: "m2", altId: "dua" }],
      },
    } as any);
    await handler.registerMedia({
      context,
      input: { storageKey: "admin-1/a.webp" },
    } as any);
    await handler.listPublic({ input: { locale: "id", limit: 12 } } as any);
    await handler.getPublic({ input: { locale: "id", slug: "a" } } as any);
    await handler.listPublicCategories({ input: { locale: "en" } } as any);
    await handler.sitemap({ input: {} } as any);

    expect(blog.createCategory).toHaveBeenCalledWith({ titleId: "a" });
    expect(blog.reorderCategories).toHaveBeenCalledWith(["a"]);
    expect(blog.getAdmin).toHaveBeenCalledWith("a");
    expect(blog.createArticle).toHaveBeenCalledWith(
      { categoryId: "c" },
      "admin-1",
    );
    expect(blog.publishVersion).toHaveBeenCalledWith(
      { articleId: "a" },
      "admin-1",
    );
    expect(blog.unpublishVersion).toHaveBeenCalledWith(
      { articleId: "a" },
      "admin-1",
    );
    expect(blog.archiveArticle).toHaveBeenCalledWith(
      { articleId: "a" },
      "admin-1",
    );
    expect(blog.registerMedia).toHaveBeenCalledWith(
      { storageKey: "admin-1/a.webp" },
      "admin-1",
    );
    expect(blog.replaceGallery).toHaveBeenCalledWith({
      articleId: "a",
      expectedVersion: 2,
      images: [
        { mediaId: "m1", altId: null, altEn: null },
        { mediaId: "m2", altId: "dua", altEn: null },
      ],
    });
    expect(blog.listPublicCategories).toHaveBeenCalledWith("en");
  });

  test("rejects an admin action without a session user", () => {
    const handler = createBlogHandler(service() as any);
    expect(() =>
      handler.createArticle({ context: { session: null }, input: {} } as any),
    ).toThrow("Admin blog handler requires a session user");
  });

  test("maps domain failures to RPC errors", async () => {
    const handler = createBlogHandler(
      service({
        getAdmin: mock(async () => {
          throw new BlogNotFoundError("missing");
        }),
      }) as any,
    );
    await expect(
      handler.get({ input: { articleId: "missing" } } as any),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
