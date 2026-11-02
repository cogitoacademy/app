import { describe, expect, test } from "bun:test";

import { createBlogRepo } from "../../modules/blog/blog.repo";

function createFake(rows: unknown[]) {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    set: () => chain,
    values: () => chain,
    returning: async () => rows,
  };
  // oxlint-disable-next-line unicorn/no-thenable -- the fake query builder must be awaitable
  Object.defineProperty(chain, "then", {
    value: (resolve: any, reject: any) =>
      Promise.resolve(rows).then(resolve, reject),
  });
  const db: any = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    transaction: async (fn: any) => fn(db),
  };
  return db;
}

describe("blog repository", () => {
  test("lists admin articles for each filter shape and cursor", async () => {
    const repo = createBlogRepo(createFake([{ id: "row" }]));
    const inputs = [
      { limit: 20, cursor: null },
      { status: "published", limit: 20, cursor: null },
      { locale: "id", limit: 20, cursor: null },
      { status: "published", locale: "en", limit: 20, cursor: null },
      {
        limit: 20,
        cursor: { updatedAt: new Date("2026-01-01T00:00:00Z"), id: "row" },
      },
    ];
    const results = await Promise.all(
      inputs.map((input) => repo.listAdminArticles(input)),
    );
    for (const result of results) expect(result).toEqual([{ id: "row" }]);
  });

  test("returns early for empty id lists", async () => {
    const repo = createBlogRepo(createFake([{ id: "row" }]));
    expect(await repo.versionsForArticles([])).toEqual([]);
    expect(await repo.mediaByIds([])).toEqual([]);
    expect(await repo.tutorsByIds([])).toEqual([]);
    expect(await repo.publishedCardsByIds("id", [])).toEqual([]);
    expect(await repo.versionsForArticles(["a"])).toEqual([{ id: "row" }]);
    expect(await repo.mediaByIds(["a"])).toEqual([{ id: "row" }]);
    expect(await repo.tutorsByIds(["a"])).toEqual([{ id: "row" }]);
    expect(await repo.publishedCardsByIds("id", ["a"])).toEqual([
      { id: "row" },
    ]);
  });

  test("reads single rows and related helpers", async () => {
    const repo = createBlogRepo(createFake([{ id: "row", name: "Tutor" }]));
    expect(await repo.articleById("a")).toEqual({ id: "row", name: "Tutor" });
    expect(await repo.categoryById("a")).toEqual({ id: "row", name: "Tutor" });
    expect(await repo.mediaById("a")).toEqual({ id: "row", name: "Tutor" });
    expect(await repo.galleryForArticle("a")).toEqual([
      { id: "row", name: "Tutor" },
    ]);
    expect(await repo.versionsForArticle("a")).toEqual([
      { id: "row", name: "Tutor" },
    ]);
    expect(await repo.relatedIds("a")).toEqual(["row"]);
    expect(await repo.listTutors()).toEqual([{ id: "row", name: "Tutor" }]);
    expect(await repo.versionById("a")).toEqual({ id: "row", name: "Tutor" });
    expect(await repo.versionByArticleLocale("a", "id")).toEqual({
      id: "row",
      name: "Tutor",
    });
    expect(await repo.slugOwner("id", "slug")).toEqual({
      id: "row",
      name: "Tutor",
    });
    expect(await repo.mediaByStorageKey("key")).toEqual({
      id: "row",
      name: "Tutor",
    });
  });

  test("inserts articles, versions, categories, and media", async () => {
    const repo = createBlogRepo(createFake([{ id: "row" }]));
    expect(await repo.createArticle({} as any)).toEqual({ id: "row" });
    expect(await repo.insertVersion({} as any)).toEqual({ id: "row" });
    expect(await repo.createCategory({} as any)).toEqual({ id: "row" });
    expect(await repo.insertMedia({} as any)).toEqual({ id: "row" });

    const empty = createBlogRepo(createFake([]));
    await expect(empty.createArticle({} as any)).rejects.toThrow(
      "Blog article insert returned no row",
    );
    await expect(empty.insertVersion({} as any)).rejects.toThrow(
      "Blog version insert returned no row",
    );
    await expect(empty.createCategory({} as any)).rejects.toThrow(
      "Blog category insert returned no row",
    );
    await expect(empty.insertMedia({} as any)).rejects.toThrow(
      "Blog media insert returned no row",
    );
  });

  test("updates rows with optimistic version guards", async () => {
    const repo = createBlogRepo(createFake([{ id: "row", version: 2 }]));
    expect(await repo.updateArticleIfVersion("a", 1, {} as any)).toEqual({
      id: "row",
      version: 2,
    });
    expect(await repo.updateVersionIfVersion("v", 1, {} as any)).toEqual({
      id: "row",
      version: 2,
    });
    expect(await repo.updateCategoryIfVersion("c", 1, {} as any)).toEqual({
      id: "row",
      version: 2,
    });
  });

  test("archives articles and skips version updates when missing", async () => {
    const found = createBlogRepo(createFake([{ id: "row" }]));
    expect(await found.archiveArticle("a")).toEqual({ id: "row" });
    const missing = createBlogRepo(createFake([]));
    expect(await missing.archiveArticle("a")).toBeUndefined();
  });

  test("replaces related articles and gallery rows", async () => {
    const repo = createBlogRepo(createFake([{ id: "row" }]));
    await repo.replaceRelated("a", []);
    await repo.replaceRelated("a", ["b", "c"]);
    await repo.replaceGallery("a", []);
    await repo.replaceGallery("a", [
      { mediaId: "m1", sortOrder: 0, altId: null, altEn: null },
    ]);
    expect(true).toBe(true);
  });

  test("lists published content with and without a cursor", async () => {
    const repo = createBlogRepo(createFake([{ articleId: "a" }]));
    expect(
      await repo.listPublished({ locale: "id", limit: 12, cursor: null }),
    ).toEqual([{ articleId: "a" }]);
    expect(
      await repo.listPublished({
        locale: "id",
        limit: 12,
        cursor: { updatedAt: new Date("2026-01-01T00:00:00Z"), id: "v" },
      }),
    ).toEqual([{ articleId: "a" }]);
    expect(await repo.getPublishedBySlug({ locale: "id", slug: "a" })).toEqual({
      articleId: "a",
    });
    expect(await repo.publishedAlternate("a", "en")).toEqual({
      articleId: "a",
    });
    expect(await repo.publishedGallery("a")).toEqual([{ articleId: "a" }]);
  });

  test("checks category children and article usage", async () => {
    const empty = createBlogRepo(createFake([]));
    expect(await empty.categoryHasChildren("c")).toBe(false);
    expect(await empty.categoryHasArticles("c")).toBe(false);

    const found = createBlogRepo(createFake([{ id: "c" }]));
    expect(await found.categoryHasChildren("c")).toBe(true);
    expect(await found.categoryHasArticles("c")).toBe(true);
  });

  test("deletes categories at the expected version", async () => {
    expect(
      await createBlogRepo(createFake([])).deleteCategoryIfVersion("c", 1),
    ).toBeUndefined();
    expect(
      await createBlogRepo(createFake([{ id: "c" }])).deleteCategoryIfVersion(
        "c",
        1,
      ),
    ).toEqual({ id: "c" });
  });

  test("loads related fallback cards with and without exclusions", async () => {
    const repo = createBlogRepo(createFake([{ articleId: "r" }]));
    const base = {
      locale: "id",
      articleId: "a",
      categoryId: "c",
      limit: 2,
    };
    expect(
      await repo.relatedFallbackCards({
        ...base,
        subcategoryId: "s",
        excludeArticleIds: ["a"],
      }),
    ).toEqual([{ articleId: "r" }]);
    expect(
      await repo.relatedFallbackCards({
        ...base,
        subcategoryId: null,
        excludeArticleIds: [],
      }),
    ).toEqual([{ articleId: "r" }]);
  });

  test("manages categories and counts", async () => {
    const repo = createBlogRepo(createFake([{ id: "row", count: 3 }]));
    expect(await repo.listCategoriesAdmin()).toEqual([{ id: "row", count: 3 }]);
    expect(await repo.articleCountsByCategory()).toEqual([
      { id: "row", count: 3 },
    ]);
    await repo.reorderCategories(["a", "b"]);
    expect(await repo.publishedCountForCategory("id", "cat")).toBe(3);
    expect(await repo.listCategoriesWithCounts("id")).toEqual([
      { id: "row", count: 3 },
    ]);
    expect(await repo.sitemapRows()).toEqual([{ id: "row", count: 3 }]);

    const empty = createBlogRepo(createFake([]));
    expect(await empty.publishedCountForCategory("id", "cat")).toBe(0);
    expect(await empty.hasPublishedArticleInCategory("cat")).toBe(false);
    expect(await empty.publishedArticleUsesCategory("cat")).toBe(false);
  });

  test("detects published category usage", async () => {
    const repo = createBlogRepo(createFake([{ id: "row" }]));
    expect(await repo.hasPublishedArticleInCategory("cat")).toBe(true);
    expect(await repo.publishedArticleUsesCategory("cat")).toBe(true);
  });

  test("finds category slug owners with and without an exclusion", async () => {
    const repo = createBlogRepo(createFake([{ id: "row" }]));
    expect(await repo.categorySlugOwner("id", "slug")).toEqual({ id: "row" });
    expect(await repo.categorySlugOwner("en", "slug", "other")).toEqual({
      id: "row",
    });
  });

  test("exposes a transaction wrapper", async () => {
    const repo = createBlogRepo(createFake([{ id: "row" }]));
    expect(await repo.transaction(async () => "done")).toBe("done");
  });
});
