import { describe, expect, mock, test } from "bun:test";

import { createBlogService } from "../../modules/blog/blog.service";
import type { StoragePort } from "../../lib/storage";

const stamp = new Date("2026-01-01T00:00:00.000Z");

const storage: StoragePort = {
  async put(key) {
    return { key, url: `https://cdn.test/${key}` };
  },
  async getSignedUploadUrl(key) {
    return { url: `https://upload.test/${key}`, method: "PUT", fields: {} };
  },
  resolvePublicUrl(key) {
    return `https://cdn.test/${key}`;
  },
};

const articleRow = (over: Record<string, unknown> = {}) => ({
  id: "a",
  categoryId: "c",
  subcategoryId: null,
  heroMediaId: null,
  featuredTutorId: null,
  reviewedByTutorId: null,
  internalNotes: null,
  archivedAt: null,
  version: 1,
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});

const versionRow = (over: Record<string, unknown> = {}) => ({
  id: "v",
  articleId: "a",
  locale: "id",
  slug: "slug",
  title: "Title",
  seoTitle: "SEO",
  metaDescription: "Meta",
  lead: "Lead",
  mainKeyword: null,
  secondaryKeywords: null,
  keyFacts: [{ text: "Fact" }],
  body: [{ type: "paragraph", runs: [{ text: "Halo" }] }],
  faq: [],
  heroAlt: "Alt",
  readingMinutes: 1,
  status: "draft",
  publishedAt: null,
  version: 1,
  updatedAt: stamp,
  ...over,
});

const allBlocks = [
  { type: "heading", level: 2, text: "Heading" },
  { type: "paragraph", runs: [{ text: "Paragraph" }] },
  { type: "list", style: "ordered", items: [[{ text: "Item" }]] },
  { type: "quote", runs: [{ text: "Quote" }] },
  { type: "callout", title: "Callout", runs: [{ text: "Body" }] },
  { type: "image", mediaId: "m1", alt: "Image" },
  {
    type: "embed",
    provider: "instagram",
    url: "https://instagram.com/reel/abc//",
    posterMediaId: "m2",
  },
];

const versionInput = {
  articleId: "a",
  locale: "id" as const,
  expectedVersion: 1,
  slug: "slug",
  title: "Title",
  seoTitle: "SEO",
  metaDescription: "Meta",
  lead: "Lead",
  mainKeyword: null,
  secondaryKeywords: null,
  keyFacts: [{ text: "Fact" }],
  body: allBlocks,
  faq: [],
  heroAlt: "Alt",
};

function baseRepo() {
  return {
    listAdminArticles: mock(async () => []),
    versionsForArticles: mock(async () => []),
    articleById: mock(async () => undefined),
    categoryById: mock(async () => undefined),
    mediaById: mock(async () => undefined),
    mediaByIds: mock(async () => []),
    galleryForArticle: mock(async () => []),
    versionsForArticle: mock(async () => []),
    relatedIds: mock(async () => []),
    tutorsByIds: mock(async () => []),
    listTutors: mock(async () => []),
    createArticle: mock(async (values: any) => ({
      ...values,
      id: "a",
      version: 1,
    })),
    updateArticleIfVersion: mock(async () => undefined),
    versionByArticleLocale: mock(async () => undefined),
    versionById: mock(async () => undefined),
    insertVersion: mock(async (values: any) => ({
      ...values,
      id: "v",
      version: 1,
      updatedAt: stamp,
    })),
    updateVersionIfVersion: mock(async () => undefined),
    slugOwner: mock(async () => undefined),
    archiveArticle: mock(async () => undefined),
    replaceRelated: mock(async () => undefined),
    replaceGallery: mock(async () => undefined),
    publishedCardsByIds: mock(async () => []),
    listPublished: mock(async () => []),
    getPublishedBySlug: mock(async () => undefined),
    publishedAlternate: mock(async () => undefined),
    publishedGallery: mock(async () => []),
    listCategoriesAdmin: mock(async () => []),
    articleCountsByCategory: mock(async () => []),
    createCategory: mock(async (values: any) => ({
      ...values,
      id: "c",
      version: 1,
    })),
    updateCategoryIfVersion: mock(async () => undefined),
    reorderCategories: mock(async () => undefined),
    publishedCountForCategory: mock(async () => 0),
    listCategoriesWithCounts: mock(async () => []),
    sitemapRows: mock(async () => []),
    insertMedia: mock(async (values: any) => ({ ...values, id: "m1" })),
    mediaByStorageKey: mock(async () => undefined),
    hasPublishedArticleInCategory: mock(async () => false),
    publishedArticleUsesCategory: mock(async () => false),
    categorySlugOwner: mock(async () => undefined),
    transaction: mock(async (fn: any) => fn({})),
  };
}

function setup(overrides: Record<string, unknown> = {}) {
  const repo = { ...baseRepo(), ...overrides };
  const audit = { record: mock(async () => undefined) };
  const service = createBlogService({
    repo: repo as any,
    storage,
    db: {} as any,
    audit: audit as any,
  });
  return { repo, audit, service };
}

describe("blog service admin listing", () => {
  test("lists admin articles with version columns and a next cursor", async () => {
    const { service } = setup({
      listAdminArticles: mock(async () => [
        {
          id: "a",
          categoryId: "c",
          categoryTitleId: null,
          categoryTitleEn: "Category EN",
          updatedAt: stamp,
          archivedAt: stamp,
        },
        {
          id: "b",
          categoryId: "c",
          categoryTitleId: "Kategori",
          categoryTitleEn: "Category",
          updatedAt: stamp,
          archivedAt: null,
        },
      ]),
      versionsForArticles: mock(async () => [
        { articleId: "a", locale: "id", title: "A", status: "draft" },
        { articleId: "b", locale: "en", title: "B", status: "published" },
      ]),
    });
    const result = await service.listAdmin({ limit: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: "a",
      categoryTitle: "Category EN",
      titleId: "A",
      statusId: "draft",
      archivedAt: stamp.toISOString(),
    });
    expect(result.nextCursor).toBeString();

    const decoded = Buffer.from(result.nextCursor!, "base64url").toString();
    expect(decoded).toBe(`${stamp.toISOString()}|a`);
  });

  test("decodes valid cursors and ignores malformed ones", async () => {
    const listAdminArticles = mock(async () => []);
    const { service } = setup({ listAdminArticles });
    const cursor = Buffer.from(`${stamp.toISOString()}|a`).toString(
      "base64url",
    );
    await service.listAdmin({ limit: 20, cursor });
    expect(listAdminArticles).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { updatedAt: stamp, id: "a" },
      }),
    );

    const noPipe = Buffer.from("abc").toString("base64url");
    await service.listAdmin({ limit: 20, cursor: noPipe });
    expect(listAdminArticles).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null }),
    );
  });

  test("falls back to a null cursor when decoding throws", async () => {
    const listAdminArticles = mock(async () => []);
    const { service } = setup({ listAdminArticles });
    const original = Buffer.from;
    (Buffer as any).from = () => {
      throw new Error("boom");
    };
    try {
      await service.listAdmin({ limit: 20, cursor: "anything" });
    } finally {
      Buffer.from = original;
    }
    expect(listAdminArticles).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null }),
    );
  });

  test("returns no next cursor when the page is not full", async () => {
    const { service } = setup({
      listAdminArticles: mock(async () => [
        {
          id: "a",
          categoryId: "c",
          categoryTitleId: "Kategori",
          categoryTitleEn: "Category",
          updatedAt: stamp,
          archivedAt: null,
        },
        {
          id: "b",
          categoryId: "c",
          categoryTitleId: null,
          categoryTitleEn: null,
          updatedAt: stamp,
          archivedAt: null,
        },
      ]),
    });
    const result = await service.listAdmin({ limit: 20 });
    expect(result.nextCursor).toBeNull();
    expect(result.rows[0]?.titleEn).toBeNull();
    expect(result.rows[0]?.statusEn).toBeNull();
    expect(result.rows[1]?.categoryTitle).toBe("");
  });
});

describe("blog service admin article detail", () => {
  test("throws when the article is missing", async () => {
    const { service } = setup();
    await expect(service.getAdmin("missing")).rejects.toMatchObject({
      code: "BLOG_NOT_FOUND",
    });
  });

  test("maps a minimal article with no optional relations", async () => {
    const { service } = setup({
      articleById: mock(async () =>
        articleRow({ updatedAt: "not-a-date", createdAt: "not-a-date" }),
      ),
      categoryById: mock(async () => ({
        id: "c",
        slugId: "slug-id",
        slugEn: "slug-en",
        titleId: "Judul",
        titleEn: "Title",
        parentId: null,
      })),
      versionsForArticle: mock(async () => []),
    });
    const result = await service.getAdmin("a");
    expect(result.subcategory).toBeNull();
    expect(result.heroMedia).toBeNull();
    expect(result.featuredTutor).toBeNull();
    expect(result.reviewedByTutor).toBeNull();
    expect(result.versions).toEqual({ id: null, en: null });
    expect(result.createdAt).toBe(new Date(0).toISOString());
    expect(result.updatedAt).toBe(new Date(0).toISOString());
  });

  test("resolves body images from both languages without gallery membership", async () => {
    const mediaByIds = mock(async () => [
      {
        id: "inline",
        storageKey: "blog/inline.webp",
        filename: "inline.webp",
        contentType: "image/webp",
        width: 1200,
        height: 800,
        byteSize: 100,
      },
    ]);
    const { service } = setup({
      articleById: mock(async () => articleRow()),
      categoryById: mock(async () => ({
        id: "c",
        slugId: "stories",
        slugEn: "stories",
        titleId: "Cerita",
        titleEn: "Stories",
        parentId: null,
      })),
      versionsForArticle: mock(async () => [
        versionRow({
          body: [{ type: "image", mediaId: "inline", alt: "Photo" }],
        }),
        versionRow({
          locale: "en",
          body: [{ type: "image", mediaId: "inline", alt: "Photo" }],
        }),
      ]),
      mediaByIds,
    });
    const result = await service.getAdmin("a");
    expect(mediaByIds).toHaveBeenCalledWith(["inline"]);
    expect(result.bodyMedia[0]).toMatchObject({
      id: "inline",
      url: "https://cdn.test/blog/inline.webp",
    });
    expect(result.gallery).toEqual([]);
  });

  test("maps an article with a single language version", async () => {
    const onlyId = setup({
      articleById: mock(async () => articleRow()),
      categoryById: mock(async () => ({
        id: "c",
        slugId: "slug-id",
        slugEn: "slug-en",
        titleId: "Judul",
        titleEn: "Title",
        parentId: null,
      })),
      versionsForArticle: mock(async () => [versionRow({ locale: "id" })]),
    });
    const idOnly = await onlyId.service.getAdmin("a");
    expect(idOnly.versions.id?.locale).toBe("id");
    expect(idOnly.versions.en).toBeNull();

    const onlyEn = setup({
      articleById: mock(async () => articleRow()),
      categoryById: mock(async () => ({
        id: "c",
        slugId: "slug-id",
        slugEn: "slug-en",
        titleId: "Judul",
        titleEn: "Title",
        parentId: null,
      })),
      versionsForArticle: mock(async () => [versionRow({ locale: "en" })]),
    });
    const enOnly = await onlyEn.service.getAdmin("a");
    expect(enOnly.versions.id).toBeNull();
    expect(enOnly.versions.en?.locale).toBe("en");
  });

  test("maps a complete article with gallery and tutors", async () => {
    const { service } = setup({
      articleById: mock(async () =>
        articleRow({
          subcategoryId: "s",
          heroMediaId: "h",
          featuredTutorId: "t1",
          reviewedByTutorId: "t2",
        }),
      ),
      categoryById: mock(async (id: string) => ({
        id,
        slugId: "slug-id",
        slugEn: "slug-en",
        titleId: "Judul",
        titleEn: "Title",
        parentId: null,
      })),
      mediaById: mock(async () => ({
        id: "h",
        storageKey: "hero.webp",
        filename: "hero.webp",
        contentType: "image/webp",
        width: 10,
        height: 10,
        byteSize: 100,
      })),
      galleryForArticle: mock(async () => [
        {
          media: {
            id: "g",
            storageKey: "gallery.webp",
            filename: "gallery.webp",
            contentType: "image/webp",
            width: 5,
            height: 5,
            byteSize: 10,
          },
          sortOrder: 1,
          altId: "alt",
          altEn: "alt-en",
        },
      ]),
      tutorsByIds: mock(async () => [{ id: "t1", name: "Tutor One" }]),
      versionsForArticle: mock(async () => [
        versionRow({ locale: "id" }),
        versionRow({ id: "ve", locale: "en", publishedAt: "not-a-date" }),
      ]),
      relatedIds: mock(async () => ["r1"]),
    });
    const result = await service.getAdmin("a");
    expect(result.heroMedia?.url).toBe("https://cdn.test/hero.webp");
    expect(result.gallery[0]?.altId).toBe("alt");
    expect(result.featuredTutor).toEqual({ id: "t1", name: "Tutor One" });
    expect(result.reviewedByTutor).toBeNull();
    expect(result.versions.id?.slug).toBe("slug");
    expect(result.versions.en?.publishedAt).toBeNull();
  });
});

describe("blog service article creation and updates", () => {
  test("creates an article with optional relations", async () => {
    const { service } = setup({
      categoryById: mock(async () => ({
        id: "c",
        slugId: "c",
        slugEn: "c",
        titleId: "C",
        titleEn: "C",
        parentId: null,
      })),
      tutorsByIds: mock(async () => [{ id: "t", name: "Tutor" }]),
    });
    await expect(
      service.createArticle(
        {
          categoryId: "c",
          subcategoryId: null,
          heroMediaId: null,
          featuredTutorId: "t",
          reviewedByTutorId: null,
          internalNotes: null,
        } as any,
        "admin",
      ),
    ).resolves.toEqual({ articleId: "a", version: 1 });

    const plain = setup({
      categoryById: mock(async (id: string) => ({
        id,
        slugId: id,
        slugEn: id,
        titleId: id,
        titleEn: id,
        parentId: null,
      })),
    });
    await expect(
      plain.service.createArticle({ categoryId: "c" } as any, "admin"),
    ).resolves.toEqual({ articleId: "a", version: 1 });
    expect(plain.repo.tutorsByIds).not.toHaveBeenCalled();
  });

  test("creates an article with a subcategory, hero, and review tutor", async () => {
    const { service } = setup({
      categoryById: mock(async (id: string) => ({
        id,
        slugId: id,
        slugEn: id,
        titleId: id,
        titleEn: id,
        parentId: id === "s" ? "c" : null,
      })),
      mediaById: mock(async () => ({ id: "h" })),
      tutorsByIds: mock(async () => [{ id: "t", name: "Tutor" }]),
    });
    await expect(
      service.createArticle(
        {
          categoryId: "c",
          subcategoryId: "s",
          heroMediaId: "h",
          featuredTutorId: "t",
          reviewedByTutorId: "t",
          internalNotes: "note",
        } as any,
        "admin",
      ),
    ).resolves.toEqual({ articleId: "a", version: 1 });
  });

  test("rejects missing categories, bad subcategories, media, and tutors", async () => {
    const missingCategory = setup();
    await expect(
      missingCategory.service.createArticle(
        { categoryId: "c" } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const badSub = setup({
      categoryById: mock(async (id: string) => ({
        id,
        parentId: id === "c" ? null : "other",
        slugId: id,
        slugEn: id,
        titleId: id,
        titleEn: id,
      })),
    });
    await expect(
      badSub.service.createArticle(
        { categoryId: "c", subcategoryId: "s" } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_CATEGORY_INVALID" });

    const missingSub = setup({
      categoryById: mock(async (id: string) =>
        id === "c"
          ? {
              id,
              parentId: null,
              slugId: id,
              slugEn: id,
              titleId: id,
              titleEn: id,
            }
          : undefined,
      ),
    });
    await expect(
      missingSub.service.createArticle(
        { categoryId: "c", subcategoryId: "s" } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const badHero = setup({
      categoryById: mock(async (id: string) => ({
        id,
        parentId: null,
        slugId: id,
        slugEn: id,
        titleId: id,
        titleEn: id,
      })),
    });
    await expect(
      badHero.service.createArticle(
        { categoryId: "c", heroMediaId: "h" } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_MEDIA_INVALID" });

    const badTutor = setup({
      categoryById: mock(async (id: string) => ({
        id,
        parentId: null,
        slugId: id,
        slugEn: id,
        titleId: id,
        titleEn: id,
      })),
      tutorsByIds: mock(async () => [{ id: "other", name: "Other" }]),
    });
    await expect(
      badTutor.service.createArticle(
        {
          categoryId: "c",
          featuredTutorId: "t",
          reviewedByTutorId: "u",
        } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const duplicateRows = setup({
      categoryById: mock(async (id: string) => ({
        id,
        parentId: null,
        slugId: id,
        slugEn: id,
        titleId: id,
        titleEn: id,
      })),
      tutorsByIds: mock(async () => [
        { id: "t", name: "Tutor" },
        { id: "t", name: "Tutor" },
      ]),
    });
    await expect(
      duplicateRows.service.createArticle(
        { categoryId: "c", featuredTutorId: "t" } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });
  });

  test("updates an article and reports missing, archived, and stale rows", async () => {
    const category = {
      id: "c",
      parentId: null,
      slugId: "c",
      slugEn: "c",
      titleId: "C",
      titleEn: "C",
    };
    const success = setup({
      articleById: mock(async () => articleRow()),
      categoryById: mock(async () => category),
      updateArticleIfVersion: mock(async () => ({ id: "a", version: 2 })),
    });
    await expect(
      success.service.updateArticle(
        { articleId: "a", expectedVersion: 1, internalNotes: null } as any,
        "admin",
      ),
    ).resolves.toEqual({ articleId: "a", version: 2 });

    const missing = setup();
    await expect(
      missing.service.updateArticle(
        { articleId: "a", expectedVersion: 1 } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const archived = setup({
      articleById: mock(async () => articleRow({ archivedAt: stamp })),
    });
    await expect(
      archived.service.updateArticle(
        { articleId: "a", expectedVersion: 1 } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_ARTICLE_ARCHIVED" });

    const badHero = setup({
      articleById: mock(async () => articleRow()),
      categoryById: mock(async () => category),
    });
    await expect(
      badHero.service.updateArticle(
        { articleId: "a", expectedVersion: 1, heroMediaId: "h" } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_MEDIA_INVALID" });

    const stale = setup({
      articleById: mock(async () => articleRow({ version: 3 })),
      categoryById: mock(async () => category),
    });
    await expect(
      stale.service.updateArticle(
        { articleId: "a", expectedVersion: 1 } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  test("updates optional article media and tutors", async () => {
    const { service } = setup({
      articleById: mock(async () => articleRow()),
      categoryById: mock(async (id: string) => ({
        id,
        parentId: id === "s" ? "c" : null,
        slugId: id,
        slugEn: id,
        titleId: id,
        titleEn: id,
      })),
      mediaById: mock(async () => ({ id: "h" })),
      tutorsByIds: mock(async () => [{ id: "t", name: "Tutor" }]),
      updateArticleIfVersion: mock(async () => ({ id: "a", version: 2 })),
    });
    await expect(
      service.updateArticle(
        {
          articleId: "a",
          expectedVersion: 1,
          categoryId: "c",
          subcategoryId: "s",
          heroMediaId: "h",
          featuredTutorId: "t",
          reviewedByTutorId: "t",
        } as any,
        "admin",
      ),
    ).resolves.toEqual({ articleId: "a", version: 2 });
  });

  test("rejects missing and archived articles", async () => {
    const missing = setup();
    await expect(
      missing.service.saveVersion(versionInput as any),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const archived = setup({
      articleById: mock(async () => articleRow({ archivedAt: stamp })),
    });
    await expect(
      archived.service.saveVersion(versionInput as any),
    ).rejects.toMatchObject({ code: "BLOG_ARTICLE_ARCHIVED" });
  });

  test("inserts a new version with every block type normalized", async () => {
    const { repo, service } = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => [{ id: "m1" }, { id: "m2" }]),
      insertVersion: mock(async (values: any) => ({
        ...values,
        id: "v",
        version: 1,
        updatedAt: stamp,
      })),
    });
    const saved = await service.saveVersion({
      ...(versionInput as any),
      expectedVersion: 0,
    });
    expect(saved.id).toBe("v");
    const inserted = repo.insertVersion.mock.calls[0]![0] as any;
    expect(inserted.body.at(-1).url).toBe("https://www.instagram.com/reel/abc");
    expect(inserted.readingMinutes).toBeGreaterThanOrEqual(1);
  });

  test("computes reading time with FAQ entries and no body media", async () => {
    const { repo, service } = setup({
      articleById: mock(async () => articleRow()),
      insertVersion: mock(async (values: any) => ({
        ...values,
        id: "v",
        version: 1,
        updatedAt: stamp,
      })),
    });
    await service.saveVersion({
      ...(versionInput as any),
      expectedVersion: 0,
      body: [{ type: "paragraph", runs: [{ text: "Halo" }] }],
      faq: [{ question: "Pertanyaan?", answer: "Jawaban." }],
      heroAlt: null,
    });
    const inserted = repo.insertVersion.mock.calls[0]![0] as any;
    expect(inserted.faq).toHaveLength(1);
    expect(inserted.heroAlt).toBeNull();
  });

  test("rejects a new version with a non-zero expected version", async () => {
    const { service } = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => [{ id: "m1" }, { id: "m2" }]),
    });
    await expect(
      service.saveVersion(versionInput as any),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  test("rejects unknown body media and slugs owned by another article", async () => {
    const badMedia = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => [{ id: "m1" }]),
    });
    await expect(
      badMedia.service.saveVersion({
        ...(versionInput as any),
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ code: "BLOG_MEDIA_INVALID" });

    const taken = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => [{ id: "m1" }, { id: "m2" }]),
      slugOwner: mock(async () => ({ articleId: "other", versionId: "v2" })),
    });
    await expect(
      taken.service.saveVersion({
        ...(versionInput as any),
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" });
  });

  test("locks a published slug and updates drafts", async () => {
    const immutable = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => [{ id: "m1" }, { id: "m2" }]),
      versionByArticleLocale: mock(async () =>
        versionRow({ publishedAt: stamp, slug: "old-slug" }),
      ),
    });
    await expect(
      immutable.service.saveVersion({
        ...(versionInput as any),
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "SLUG_IMMUTABLE" });

    const updated = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => [{ id: "m1" }, { id: "m2" }]),
      versionByArticleLocale: mock(async () => versionRow()),
      updateVersionIfVersion: mock(async (id: string) => ({
        ...versionRow(),
        id,
        version: 2,
      })),
    });
    await expect(
      updated.service.saveVersion({
        ...(versionInput as any),
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({ id: "v", version: 2 });

    const stale = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => [{ id: "m1" }, { id: "m2" }]),
      versionByArticleLocale: mock(async () => versionRow({ version: 4 })),
    });
    await expect(
      stale.service.saveVersion({
        ...(versionInput as any),
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});

describe("blog service publishing", () => {
  const publishable = () => versionRow({ status: "draft", publishedAt: null });

  test("rejects missing articles, archived articles, and missing versions", async () => {
    const missingArticle = setup();
    await expect(
      missingArticle.service.publishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const archived = setup({
      articleById: mock(async () => articleRow({ archivedAt: stamp })),
    });
    await expect(
      archived.service.publishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_ARTICLE_ARCHIVED" });

    const missingVersion = setup({
      articleById: mock(async () => articleRow()),
    });
    await expect(
      missingVersion.service.publishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_VERSION_NOT_FOUND" });
  });

  test("reports every missing publish field including gallery alt text", async () => {
    const { service } = setup({
      articleById: mock(async () => articleRow()),
      versionByArticleLocale: mock(async () =>
        versionRow({
          title: "",
          seoTitle: "",
          slug: "",
          metaDescription: "",
          lead: "",
          body: [],
          keyFacts: [],
          heroAlt: null,
        }),
      ),
    });
    const error = await service
      .publishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      )
      .catch((err) => err);
    expect(error.code).toBe("PUBLISH_INVALID");
    expect(error.details.missingFields).toEqual([
      "title",
      "seoTitle",
      "slug",
      "metaDescription",
      "lead",
      "body",
      "heroMedia",
      "heroAlt",
      "keyFacts",
    ]);

    const galleryError = setup({
      articleById: mock(async () => articleRow({ heroMediaId: "h" })),
      versionByArticleLocale: mock(async () => versionRow({ locale: "id" })),
      galleryForArticle: mock(async () => [
        { altId: null, altEn: "EN", media: {}, sortOrder: 0 },
      ]),
    });
    await expect(
      galleryError.service.publishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "PUBLISH_INVALID" });

    const enGalleryError = setup({
      articleById: mock(async () => articleRow({ heroMediaId: "h" })),
      versionByArticleLocale: mock(async () => versionRow({ locale: "en" })),
      galleryForArticle: mock(async () => [
        { altId: "ID", altEn: null, media: {}, sortOrder: 0 },
      ]),
    });
    await expect(
      enGalleryError.service.publishVersion(
        { articleId: "a", locale: "en", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "PUBLISH_INVALID" });
  });

  test("publishes with an audit entry and reports version conflicts", async () => {
    const success = setup({
      articleById: mock(async () => articleRow({ heroMediaId: "h" })),
      versionByArticleLocale: mock(async () => publishable()),
      galleryForArticle: mock(async () => [
        { altId: "ID", altEn: "EN", media: {}, sortOrder: 0 },
      ]),
      updateVersionIfVersion: mock(async () => ({
        ...publishable(),
        status: "published",
        publishedAt: stamp,
        version: 2,
      })),
    });
    const published = await success.service.publishVersion(
      { articleId: "a", locale: "id", expectedVersion: 1 },
      "admin",
    );
    expect(published.status).toBe("published");
    expect(success.audit.record).toHaveBeenCalled();

    const stale = setup({
      articleById: mock(async () => articleRow({ heroMediaId: "h" })),
      versionByArticleLocale: mock(async () => publishable()),
      galleryForArticle: mock(async () => [
        { altId: "ID", altEn: "EN", media: {}, sortOrder: 0 },
      ]),
      versionById: mock(async () => ({ version: 7 })),
    });
    await expect(
      stale.service.publishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const staleNoRow = setup({
      articleById: mock(async () => articleRow({ heroMediaId: "h" })),
      versionByArticleLocale: mock(async () => publishable()),
      galleryForArticle: mock(async () => [
        { altId: "ID", altEn: "EN", media: {}, sortOrder: 0 },
      ]),
    });
    await expect(
      staleNoRow.service.publishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  test("unpublishes with an audit entry and handles conflicts", async () => {
    const success = setup({
      versionByArticleLocale: mock(async () =>
        versionRow({ status: "published" }),
      ),
      updateVersionIfVersion: mock(async () => ({
        ...versionRow(),
        status: "draft",
        version: 2,
      })),
    });
    await expect(
      success.service.unpublishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).resolves.toMatchObject({ status: "draft" });
    expect(success.audit.record).toHaveBeenCalled();

    const missing = setup();
    await expect(
      missing.service.unpublishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_VERSION_NOT_FOUND" });

    const stale = setup({
      versionByArticleLocale: mock(async () => versionRow({ version: 5 })),
    });
    await expect(
      stale.service.unpublishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});

describe("blog service article maintenance", () => {
  test("archives an article and validates the version", async () => {
    const missing = setup();
    await expect(
      missing.service.archiveArticle(
        { articleId: "a", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const stale = setup({
      articleById: mock(async () => articleRow()),
    });
    await expect(
      stale.service.archiveArticle(
        { articleId: "a", expectedVersion: 9 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const noRow = setup({
      articleById: mock(async () => articleRow()),
    });
    await expect(
      noRow.service.archiveArticle(
        { articleId: "a", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const success = setup({
      articleById: mock(async () => articleRow()),
      archiveArticle: mock(async () => articleRow({ archivedAt: stamp })),
    });
    await expect(
      success.service.archiveArticle(
        { articleId: "a", expectedVersion: 1 },
        "admin",
      ),
    ).resolves.toEqual({ articleId: "a" });
    expect(success.audit.record).toHaveBeenCalled();
  });

  test("replaces related articles after validating each one", async () => {
    const missing = setup();
    await expect(
      missing.service.replaceRelated({
        articleId: "a",
        expectedVersion: 1,
        relatedArticleIds: [],
      }),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const stale = setup({
      articleById: mock(async () => articleRow({ version: 2 })),
    });
    await expect(
      stale.service.replaceRelated({
        articleId: "a",
        expectedVersion: 1,
        relatedArticleIds: [],
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const missingRelated = setup({
      articleById: mock(async (id: string) =>
        id === "a" ? articleRow() : undefined,
      ),
    });
    await expect(
      missingRelated.service.replaceRelated({
        articleId: "a",
        expectedVersion: 1,
        relatedArticleIds: ["b"],
      }),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const archivedRelated = setup({
      articleById: mock(async (id: string) =>
        id === "a" ? articleRow() : articleRow({ archivedAt: stamp }),
      ),
    });
    await expect(
      archivedRelated.service.replaceRelated({
        articleId: "a",
        expectedVersion: 1,
        relatedArticleIds: ["b"],
      }),
    ).rejects.toMatchObject({ code: "BLOG_ARTICLE_ARCHIVED" });

    const success = setup({
      articleById: mock(async () => articleRow()),
    });
    await expect(
      success.service.replaceRelated({
        articleId: "a",
        expectedVersion: 1,
        relatedArticleIds: ["b"],
      }),
    ).resolves.toEqual({ articleId: "a" });
    expect(success.repo.replaceRelated).toHaveBeenCalledWith("a", ["b"]);
  });

  test("replaces gallery images after validating media", async () => {
    const missing = setup();
    await expect(
      missing.service.replaceGallery({
        articleId: "a",
        expectedVersion: 1,
        images: [],
      }),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const stale = setup({
      articleById: mock(async () => articleRow({ version: 2 })),
    });
    await expect(
      stale.service.replaceGallery({
        articleId: "a",
        expectedVersion: 1,
        images: [],
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const badMedia = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => []),
    });
    await expect(
      badMedia.service.replaceGallery({
        articleId: "a",
        expectedVersion: 1,
        images: [{ mediaId: "m1", altId: null, altEn: null }],
      }),
    ).rejects.toMatchObject({ code: "BLOG_MEDIA_INVALID" });

    const success = setup({
      articleById: mock(async () => articleRow()),
      mediaByIds: mock(async () => [{ id: "m1" }]),
    });
    await expect(
      success.service.replaceGallery({
        articleId: "a",
        expectedVersion: 1,
        images: [{ mediaId: "m1", altId: "id", altEn: "en" }],
      }),
    ).resolves.toEqual({ articleId: "a" });
    expect(success.repo.replaceGallery).toHaveBeenCalled();
  });

  test("registers media once and reuses an existing row", async () => {
    const invalid = setup();
    await expect(
      invalid.service.registerMedia(
        {
          storageKey: "other/a.webp",
          filename: "a.webp",
          contentType: "image/webp",
        } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_MEDIA_INVALID" });

    await expect(
      invalid.service.registerMedia(
        {
          storageKey: "../a.webp",
          filename: "a.webp",
          contentType: "image/webp",
        } as any,
        "admin",
      ),
    ).rejects.toMatchObject({ code: "BLOG_MEDIA_INVALID" });

    const existing = setup({
      mediaByStorageKey: mock(async () => ({
        id: "m0",
        storageKey: "admin/a.webp",
        filename: "a.webp",
        contentType: "image/webp",
        width: null,
        height: null,
        byteSize: null,
      })),
    });
    const reused = await existing.service.registerMedia(
      {
        storageKey: "admin/a.webp",
        filename: "a.webp",
        contentType: "image/webp",
      } as any,
      "admin",
    );
    expect(reused.id).toBe("m0");
    expect(existing.audit.record).not.toHaveBeenCalled();

    const inserted = setup();
    const created = await inserted.service.registerMedia(
      {
        storageKey: "admin/a.webp",
        filename: "a.webp",
        contentType: "image/webp",
        width: 3,
        height: 2,
        byteSize: 50,
      } as any,
      "admin",
    );
    expect(created.url).toBe("https://cdn.test/admin/a.webp");
    expect(inserted.audit.record).toHaveBeenCalled();

    const minimal = setup();
    const bare = await minimal.service.registerMedia(
      {
        storageKey: "admin/b.webp",
        filename: "b.webp",
        contentType: "image/webp",
      } as any,
      "admin",
    );
    expect(bare.id).toBe("m1");
    expect(minimal.repo.insertMedia).toHaveBeenCalledWith(
      expect.objectContaining({ width: null, height: null, byteSize: null }),
    );
  });
});

describe("blog service categories", () => {
  test("lists categories with article counts and tutor options", async () => {
    const { service } = setup({
      listCategoriesAdmin: mock(async () => [
        {
          id: "c",
          parentId: null,
          titleId: "C",
          titleEn: "C",
          slugId: "c",
          slugEn: "c",
          introId: null,
          introEn: null,
          isActive: true,
          version: 1,
          sortOrder: 0,
        },
      ]),
      articleCountsByCategory: mock(async () => [
        { categoryId: "c", subcategoryId: null },
        { categoryId: "x", subcategoryId: "c" },
        { categoryId: "x", subcategoryId: null },
      ]),
      listTutors: mock(async () => [{ id: "t", name: "Tutor" }]),
    });
    const [categories, tutors] = await Promise.all([
      service.listCategoriesAdmin(),
      service.listTutorOptions(),
    ]);
    expect(categories[0]?.articleCount).toBe(2);
    expect(tutors).toEqual([{ id: "t", name: "Tutor" }]);
  });

  test("creates categories with validation and ordering", async () => {
    const parent = {
      id: "p",
      parentId: null,
      titleId: "P",
      titleEn: "P",
      slugId: "p",
      slugEn: "p",
    };
    const missingParent = setup();
    await expect(
      missingParent.service.createCategory({
        parentId: "p",
      } as any),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const nestedParent = setup({
      categoryById: mock(async () => ({ ...parent, parentId: "root" })),
    });
    await expect(
      nestedParent.service.createCategory({ parentId: "p" } as any),
    ).rejects.toMatchObject({ code: "BLOG_CATEGORY_INVALID" });

    const takenId = setup({
      categorySlugOwner: mock(async (locale: string) =>
        locale === "id" ? { id: "other" } : undefined,
      ),
    });
    await expect(
      takenId.service.createCategory({
        slugId: "slug",
        slugEn: "slug-en",
      } as any),
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" });

    const takenEn = setup({
      categorySlugOwner: mock(async (locale: string) =>
        locale === "en" ? { id: "other" } : undefined,
      ),
    });
    await expect(
      takenEn.service.createCategory({
        slugId: "slug",
        slugEn: "slug-en",
      } as any),
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" });

    const success = setup({
      categoryById: mock(async () => parent),
      listCategoriesAdmin: mock(async () => [
        { sortOrder: 3 },
        { sortOrder: 7 },
      ]),
    });
    await expect(
      success.service.createCategory({
        parentId: "p",
        titleId: "C",
        titleEn: "C",
        slugId: "c",
        slugEn: "c",
        isActive: true,
      } as any),
    ).resolves.toEqual({ id: "c", version: 1 });
    expect(success.repo.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 8 }),
    );

    const noParent = setup();
    await expect(
      noParent.service.createCategory({
        titleId: "C",
        titleEn: "C",
        slugId: "c",
        slugEn: "c",
        isActive: true,
      } as any),
    ).resolves.toEqual({ id: "c", version: 1 });
    expect(noParent.repo.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null }),
    );
  });

  test("updates categories with hierarchy and usage guards", async () => {
    const category = {
      id: "c",
      parentId: null,
      titleId: "C",
      titleEn: "C",
      slugId: "c",
      slugEn: "c",
      version: 1,
    };
    const missing = setup();
    await expect(
      missing.service.updateCategory({ categoryId: "c" } as any),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const selfParent = setup({
      categoryById: mock(async () => category),
    });
    await expect(
      selfParent.service.updateCategory({
        categoryId: "c",
        parentId: "c",
      } as any),
    ).rejects.toMatchObject({ code: "BLOG_CATEGORY_INVALID" });

    const missingParent = setup({
      categoryById: mock(async (id: string) =>
        id === "c" ? category : undefined,
      ),
    });
    await expect(
      missingParent.service.updateCategory({
        categoryId: "c",
        parentId: "p",
      } as any),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const nestedParent = setup({
      categoryById: mock(async (id: string) =>
        id === "c" ? category : { ...category, id: "p", parentId: "root" },
      ),
    });
    await expect(
      nestedParent.service.updateCategory({
        categoryId: "c",
        parentId: "p",
      } as any),
    ).rejects.toMatchObject({ code: "BLOG_CATEGORY_INVALID" });

    const takenId = setup({
      categoryById: mock(async () => category),
      categorySlugOwner: mock(async (locale: string) =>
        locale === "id" ? { id: "other" } : undefined,
      ),
    });
    await expect(
      takenId.service.updateCategory({
        categoryId: "c",
        slugId: "slug",
        slugEn: "slug-en",
      } as any),
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" });

    const takenEn = setup({
      categoryById: mock(async () => category),
      categorySlugOwner: mock(async (locale: string) =>
        locale === "en" ? { id: "other" } : undefined,
      ),
    });
    await expect(
      takenEn.service.updateCategory({
        categoryId: "c",
        slugId: "slug",
        slugEn: "slug-en",
      } as any),
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" });

    const inUse = setup({
      categoryById: mock(async () => category),
      publishedArticleUsesCategory: mock(async () => true),
    });
    await expect(
      inUse.service.updateCategory({
        categoryId: "c",
        isActive: false,
      } as any),
    ).rejects.toMatchObject({ code: "BLOG_CATEGORY_IN_USE" });

    const stale = setup({
      categoryById: mock(async () => category),
    });
    await expect(
      stale.service.updateCategory({ categoryId: "c", isActive: true } as any),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const success = setup({
      categoryById: mock(async () => category),
      updateCategoryIfVersion: mock(async () => ({ id: "c", version: 2 })),
    });
    await expect(
      success.service.updateCategory({
        categoryId: "c",
        slugId: "c",
        slugEn: "c",
        titleId: "C",
        titleEn: "C",
        isActive: true,
      } as any),
    ).resolves.toEqual({ id: "c", version: 2 });

    const withParent = setup({
      categoryById: mock(async (id: string) =>
        id === "c" ? category : { ...category, id: "p", parentId: null },
      ),
      updateCategoryIfVersion: mock(async () => ({ id: "c", version: 2 })),
    });
    await expect(
      withParent.service.updateCategory({
        categoryId: "c",
        parentId: "p",
        slugId: "c",
        slugEn: "c",
        titleId: "C",
        titleEn: "C",
        isActive: true,
      } as any),
    ).resolves.toEqual({ id: "c", version: 2 });
  });

  test("reorders categories and returns the refreshed list", async () => {
    const { repo, service } = setup({
      listCategoriesAdmin: mock(async () => []),
    });
    await expect(service.reorderCategories(["a", "b"])).resolves.toEqual([]);
    expect(repo.reorderCategories).toHaveBeenCalledWith(["a", "b"]);
  });
});

describe("blog service public reads", () => {
  const cardRow = (over: Record<string, unknown> = {}) => ({
    articleId: "a",
    versionId: "v",
    slug: "slug",
    title: "Title",
    excerpt: "Excerpt",
    publishedAt: stamp,
    updatedAt: stamp,
    readingMinutes: 2,
    categorySlugId: "cat-id",
    categorySlugEn: "cat-en",
    categoryTitleId: "Kategori",
    categoryTitleEn: "Category",
    subcategorySlugId: "sub-id",
    subcategorySlugEn: "sub-en",
    subcategoryTitleId: "Sub",
    subcategoryTitleEn: "Sub EN",
    heroUrlKey: "hero.webp",
    heroWidth: 10,
    heroHeight: 20,
    heroAlt: "Hero",
    tutorName: "Tutor",
    ...over,
  });

  test("lists public cards and builds the cursor", async () => {
    const { service } = setup({
      listPublished: mock(async () => [cardRow(), cardRow({ articleId: "b" })]),
    });
    const result = await service.listPublic({ locale: "en", limit: 1 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.category).toEqual({
      slug: "cat-en",
      title: "Category",
    });
    expect(result.rows[0]?.subcategory).toEqual({
      slug: "sub-en",
      title: "Sub EN",
    });
    expect(result.rows[0]?.hero?.url).toBe("https://cdn.test/hero.webp");
    expect(result.nextCursor).toBeString();

    const noPublished = setup({
      listPublished: mock(async () => [
        cardRow({
          publishedAt: null,
          heroUrlKey: null,
          subcategorySlugId: null,
          subcategorySlugEn: null,
        }),
        cardRow({ articleId: "b" }),
      ]),
    });
    const second = await noPublished.service.listPublic({
      locale: "id",
      limit: 1,
    });
    expect(second.nextCursor).toBeNull();
    expect(second.rows[0]?.hero).toBeNull();
    expect(second.rows[0]?.subcategory).toBeNull();
    expect(second.rows[0]?.category).toEqual({
      slug: "cat-id",
      title: "Kategori",
    });
    expect(second.rows[0]?.publishedAt).toBe(new Date(0).toISOString());
  });

  test("falls back when localized category fields are empty", async () => {
    const { service } = setup({
      listPublished: mock(async () => [
        cardRow({
          categorySlugEn: null,
          categoryTitleEn: null,
          categoryTitleId: null,
          subcategorySlugId: "sub-id",
          subcategorySlugEn: "sub-en",
          subcategoryTitleId: null,
          subcategoryTitleEn: null,
        }),
      ]),
    });
    const result = await service.listPublic({ locale: "en", limit: 12 });
    expect(result.rows[0]?.category).toEqual({ slug: "cat-id", title: null });
    expect(result.rows[0]?.subcategory).toEqual({
      slug: "sub-en",
      title: "",
    });
  });

  test("reads one public article with media, gallery, related, and alternate", async () => {
    const { service } = setup({
      getPublishedBySlug: mock(async () => ({
        ...cardRow(),
        lead: "Lead",
        seoTitle: "SEO",
        metaDescription: "Meta",
        keyFacts: [{ text: "Fact" }],
        body: [
          { type: "image", mediaId: "m1", alt: "Image" },
          {
            type: "embed",
            provider: "instagram",
            url: "https://instagram.com/reel/abc",
            posterMediaId: "m2",
          },
        ],
        faq: [],
      })),
      mediaByIds: mock(async () => [
        {
          id: "m1",
          storageKey: "one.webp",
          filename: "one.webp",
          contentType: "image/webp",
          width: 1,
          height: 1,
          byteSize: 1,
        },
        {
          id: "m2",
          storageKey: "two.webp",
          filename: "two.webp",
          contentType: "image/webp",
          width: 2,
          height: 2,
          byteSize: 2,
        },
      ]),
      publishedGallery: mock(async () => [
        { storageKey: "g.webp", width: 1, height: 2, altId: "ID", altEn: "EN" },
      ]),
      publishedAlternate: mock(async () => ({ locale: "en", slug: "en-slug" })),
      relatedIds: mock(async () => ["r1", "missing"]),
      publishedCardsByIds: mock(async () => [
        cardRow({ articleId: "r1", slug: "related" }),
      ]),
    });
    const article = await service.getPublic({ locale: "id", slug: "slug" });
    expect(article.alternate).toEqual({ locale: "en", slug: "en-slug" });
    expect(article.gallery[0]?.url).toBe("https://cdn.test/g.webp");
    expect(article.media.m1?.filename).toBe("one.webp");
    expect(article.media.m2?.filename).toBe("two.webp");
    expect(article.related).toHaveLength(1);
    expect(article.related[0]?.slug).toBe("related");
  });

  test("rejects an unknown public slug and handles no alternate", async () => {
    const missing = setup();
    await expect(
      missing.service.getPublic({ locale: "id", slug: "missing" }),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });

    const noAlternate = setup({
      getPublishedBySlug: mock(async () => ({
        ...cardRow(),
        lead: "",
        seoTitle: "",
        metaDescription: "",
        keyFacts: [],
        body: [],
        faq: [],
      })),
    });
    const article = await noAlternate.service.getPublic({
      locale: "en",
      slug: "slug",
    });
    expect(article.alternate).toBeNull();
    expect(article.related).toEqual([]);
  });

  test("lists public categories with locale fallbacks", async () => {
    const { service } = setup({
      listCategoriesWithCounts: mock(async () => [
        {
          id: "c",
          parentId: null,
          slugId: "slug-id",
          slugEn: null,
          titleId: "Judul",
          titleEn: null,
          introId: "Intro",
          introEn: null,
          count: 3,
        },
      ]),
    });
    const categories = await service.listPublicCategories("en");
    expect(categories[0]).toEqual({
      id: "c",
      parentId: null,
      slug: "slug-id",
      title: "Judul",
      intro: null,
      articleCount: 3,
    });

    const localized = setup({
      listCategoriesWithCounts: mock(async () => [
        {
          id: "c",
          parentId: null,
          slugId: "slug-id",
          slugEn: "slug-en",
          titleId: "Judul",
          titleEn: "Title",
          introId: null,
          introEn: "Intro EN",
          count: 1,
        },
      ]),
    });
    const english = await localized.service.listPublicCategories("en");
    expect(english[0]).toMatchObject({
      slug: "slug-en",
      title: "Title",
      intro: "Intro EN",
    });
  });

  test("groups sitemap entries by article with alternates", async () => {
    const { service } = setup({
      sitemapRows: mock(async () => [
        { articleId: "a", locale: "id", slug: "a-id", updatedAt: stamp },
        { articleId: "a", locale: "en", slug: "a-en", updatedAt: stamp },
        { articleId: "b", locale: "id", slug: "b-id", updatedAt: stamp },
      ]),
    });
    const entries = await service.sitemap();
    expect(entries).toEqual([
      {
        articleId: "a",
        locale: "id",
        slug: "a-id",
        updatedAt: stamp.toISOString(),
        alternate: { locale: "en", slug: "a-en" },
      },
      {
        articleId: "a",
        locale: "en",
        slug: "a-en",
        updatedAt: stamp.toISOString(),
        alternate: { locale: "id", slug: "a-id" },
      },
      {
        articleId: "b",
        locale: "id",
        slug: "b-id",
        updatedAt: stamp.toISOString(),
        alternate: null,
      },
    ]);
  });
});

describe("uncategorized blog drafts", () => {
  test("creates a draft immediately without a category", async () => {
    const { service, repo } = setup();
    expect(await service.createArticle({}, "admin")).toMatchObject({
      articleId: "a",
    });
    expect(repo.createArticle.mock.calls[0]?.[0]).toMatchObject({
      categoryId: null,
    });
    expect(repo.categoryById).not.toHaveBeenCalled();
  });
  test("opens an uncategorized draft", async () => {
    const { service } = setup({
      articleById: mock(async () => articleRow({ categoryId: null })),
    });
    expect((await service.getAdmin("a")).category).toBeNull();
  });
  test("blocks publication without category", async () => {
    const { service, repo } = setup({
      articleById: mock(async () =>
        articleRow({ categoryId: null, heroMediaId: "hero" }),
      ),
      versionByArticleLocale: mock(async () => versionRow()),
    });
    await expect(
      service.publishVersion(
        { articleId: "a", locale: "id", expectedVersion: 1 },
        "admin",
      ),
    ).rejects.toMatchObject({ code: "PUBLISH_INVALID" });
    expect(repo.updateVersionIfVersion).not.toHaveBeenCalled();
  });
  test("saving shared details preserves an existing cover", async () => {
    const { service, repo } = setup({
      articleById: mock(async () => articleRow({ heroMediaId: "hero" })),
      categoryById: mock(async () => ({
        id: "c",
        parentId: null,
        isActive: true,
      })),
      updateArticleIfVersion: mock(async () => articleRow({ version: 2 })),
    });
    await service.updateArticle(
      { articleId: "a", expectedVersion: 1, categoryId: "c" },
      "admin",
    );
    expect(repo.updateArticleIfVersion.mock.calls[0]?.[2]).toMatchObject({
      heroMediaId: "hero",
    });
  });
});

describe("blog category deletion", () => {
  test("deletes an unused category at the expected version", async () => {
    const remove = mock(async () => ({ id: "c" }));
    const { service } = setup({
      categoryById: mock(async () => ({ id: "c", version: 2 })),
      categoryHasChildren: mock(async () => false),
      categoryHasArticles: mock(async () => false),
      deleteCategoryIfVersion: remove,
    });
    expect(
      await service.deleteCategory({ categoryId: "c", expectedVersion: 2 }),
    ).toEqual({ id: "c" });
    expect(remove).toHaveBeenCalledWith("c", 2);
  });
  test("rejects articles, subcategories and stale versions", async () => {
    for (const blocked of ["children", "articles", "stale"]) {
      const remove = mock(async () => undefined);
      const { service } = setup({
        categoryById: mock(async () => ({ id: "c", version: 2 })),
        categoryHasChildren: mock(async () => blocked === "children"),
        categoryHasArticles: mock(async () => blocked === "articles"),
        deleteCategoryIfVersion: remove,
      });
      await expect(
        service.deleteCategory({ categoryId: "c", expectedVersion: 1 }),
      ).rejects.toMatchObject({
        code:
          blocked === "stale" ? "VERSION_CONFLICT" : "BLOG_CATEGORY_INVALID",
      });
      if (blocked !== "stale") expect(remove).not.toHaveBeenCalled();
    }
  });
  test("maps a concurrent foreign key reference to an actionable error", async () => {
    const { service } = setup({
      categoryById: mock(async () => ({ id: "c", version: 1 })),
      categoryHasChildren: mock(async () => false),
      categoryHasArticles: mock(async () => false),
      deleteCategoryIfVersion: mock(async () => {
        throw { cause: { code: "23503" } };
      }),
    });
    await expect(
      service.deleteCategory({ categoryId: "c", expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "BLOG_CATEGORY_INVALID" });
  });
  test("rejects a missing category", async () => {
    const { service } = setup();
    await expect(
      service.deleteCategory({ categoryId: "missing", expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "BLOG_NOT_FOUND" });
  });
});

describe("blog manual people", () => {
  test("creates and reloads manual featured and reviewer names without tutor accounts", async () => {
    const { service, repo } = setup({
      articleById: mock(async () =>
        articleRow({
          featuredTutorName: "Kak Gita",
          reviewedByName: "Guest reviewer",
        }),
      ),
      categoryById: mock(async () => ({
        id: "c",
        parentId: null,
        titleId: "Cerita",
        titleEn: "Stories",
        slugId: "cerita",
        slugEn: "stories",
      })),
    });
    await service.createArticle(
      { featuredTutorName: "Kak Gita", reviewedByName: "Guest reviewer" },
      "admin",
    );
    expect(repo.createArticle.mock.calls[0]?.[0]).toMatchObject({
      featuredTutorId: null,
      reviewedByTutorId: null,
      featuredTutorName: "Kak Gita",
      reviewedByName: "Guest reviewer",
    });
    expect(await service.getAdmin("a")).toMatchObject({
      featuredTutor: null,
      reviewedByTutor: null,
      featuredTutorName: "Kak Gita",
      reviewedByName: "Guest reviewer",
    });
  });
  test("returns a manual reviewer on public articles", async () => {
    const { service } = setup({
      getPublishedBySlug: mock(async () => ({
        articleId: "a",
        versionId: "v",
        slug: "story",
        title: "Story",
        excerpt: "",
        publishedAt: stamp,
        updatedAt: stamp,
        readingMinutes: 1,
        categorySlugId: "stories",
        categorySlugEn: "stories",
        categoryTitleId: "Cerita",
        categoryTitleEn: "Stories",
        body: [],
        faq: [],
        keyFacts: [],
        lead: "Intro",
        seoTitle: "Story",
        metaDescription: "Story",
        reviewedByName: "Guest reviewer",
        reviewedByTutorId: null,
        tutorName: "Kak Gita",
      })),
    });
    expect(
      await service.getPublic({ locale: "id", slug: "story" }),
    ).toMatchObject({ reviewerName: "Guest reviewer", tutorName: "Kak Gita" });
  });
  test("uses a linked reviewer's current name before the fallback", async () => {
    const { service } = setup({
      getPublishedBySlug: mock(async () => ({
        articleId: "a",
        versionId: "v",
        slug: "story",
        title: "Story",
        excerpt: "",
        publishedAt: stamp,
        updatedAt: stamp,
        readingMinutes: 1,
        categorySlugId: "stories",
        categorySlugEn: "stories",
        categoryTitleId: "Cerita",
        categoryTitleEn: "Stories",
        body: [],
        faq: [],
        keyFacts: [],
        lead: "Intro",
        seoTitle: "Story",
        metaDescription: "Story",
        reviewedByName: "Old name",
        reviewedByTutorId: "t",
      })),
      tutorsByIds: mock(async () => [{ id: "t", name: "Current name" }]),
    });
    expect(
      (await service.getPublic({ locale: "en", slug: "story" })).reviewerName,
    ).toBe("Current name");
  });
});
