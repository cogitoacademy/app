import { describe, expect, test } from "bun:test";

import {
  blogBlockSchema,
  blogBodySchema,
  blogRunSchema,
  createBlogArticleInput,
  normalizeEmbedUrl,
  registerBlogMediaInput,
  reorderBlogCategoriesInput,
  replaceBlogGalleryInput,
  replaceRelatedBlogArticlesInput,
} from "../../modules/blog/blog.types";

describe("blog type schemas", () => {
  test("accepts http and https run links only", () => {
    expect(
      blogRunSchema.parse({ text: "ok", href: "https://example.com/a" }).href,
    ).toBe("https://example.com/a");
    expect(
      blogRunSchema.parse({ text: "ok", href: "http://example.com/a" }).href,
    ).toBe("http://example.com/a");
    for (const href of ["ftp://example.com", "not a url"]) {
      expect(blogRunSchema.safeParse({ text: "ok", href }).success).toBe(false);
    }
  });

  test("accepts Instagram reels, posts, and TV links", () => {
    for (const url of [
      "https://instagram.com/reel/AbC_1/",
      "https://www.instagram.com/reels/AbC-1",
      "https://instagram.com/p/AbC123/",
      "https://www.instagram.com/tv/AbC123",
    ]) {
      expect(
        blogBlockSchema.safeParse({
          type: "embed",
          provider: "instagram",
          url,
        }).success,
      ).toBe(true);
    }
    for (const url of [
      "http://instagram.com/reel/AbC/",
      "https://example.com/reel/AbC/",
      "https://instagram.com/explore/AbC/",
      "https://instagram.com/reel/AbC/?utm=1",
      "https://instagram.com/reel/AbC/#comments",
      "nope",
    ]) {
      expect(
        blogBlockSchema.safeParse({
          type: "embed",
          provider: "instagram",
          url,
        }).success,
      ).toBe(false);
    }
  });

  test("accepts TikTok video links only", () => {
    for (const url of [
      "https://tiktok.com/@user/video/123",
      "https://www.tiktok.com/@user.name/video/123/",
    ]) {
      expect(
        blogBlockSchema.safeParse({
          type: "embed",
          provider: "tiktok",
          url,
        }).success,
      ).toBe(true);
    }
    for (const url of [
      "http://tiktok.com/@user/video/123",
      "https://example.com/@user/video/123",
      "https://tiktok.com/@user/photo/123",
      "https://tiktok.com/@user/video/123?is_from_webapp=1",
      "nope",
    ]) {
      expect(
        blogBlockSchema.safeParse({
          type: "embed",
          provider: "tiktok",
          url,
        }).success,
      ).toBe(false);
    }
  });

  test("normalizes embed URLs to www hosts without trailing slashes", () => {
    expect(
      normalizeEmbedUrl("instagram", "https://instagram.com/reel/abc//"),
    ).toBe("https://www.instagram.com/reel/abc");
    expect(
      normalizeEmbedUrl("tiktok", "https://tiktok.com/@user/video/1"),
    ).toBe("https://www.tiktok.com/@user/video/1");
  });

  test("normalizes blank optional ids to null", () => {
    const parsed = createBlogArticleInput.parse({
      categoryId: "c",
      subcategoryId: "",
      featuredTutorId: "t",
      internalNotes: "   ",
      consentRecordedAt: "",
    });
    expect(parsed.subcategoryId).toBeNull();
    expect(parsed.featuredTutorId).toBe("t");
    expect(parsed.internalNotes).toBeNull();
    expect(parsed.consentRecordedAt).toBeNull();
  });

  test("rejects duplicate related articles", () => {
    expect(
      replaceRelatedBlogArticlesInput.safeParse({
        articleId: "a",
        expectedVersion: 1,
        relatedArticleIds: ["b", "c"],
      }).success,
    ).toBe(true);
    expect(
      replaceRelatedBlogArticlesInput.safeParse({
        articleId: "a",
        expectedVersion: 1,
        relatedArticleIds: ["b", "b"],
      }).success,
    ).toBe(false);
  });

  test("rejects duplicate gallery images", () => {
    expect(
      replaceBlogGalleryInput.safeParse({
        articleId: "a",
        expectedVersion: 1,
        images: [
          { mediaId: "m1", altId: "satu", altEn: "one" },
          { mediaId: "m2", altId: null, altEn: null },
        ],
      }).success,
    ).toBe(true);
    expect(
      replaceBlogGalleryInput.safeParse({
        articleId: "a",
        expectedVersion: 1,
        images: [
          { mediaId: "m1", altId: "satu", altEn: "one" },
          { mediaId: "m1", altId: "dua", altEn: "two" },
        ],
      }).success,
    ).toBe(false);
  });

  test("requires width and height together for media", () => {
    const base = {
      storageKey: "admin/hero.webp",
      filename: "hero.webp",
      contentType: "image/webp" as const,
    };
    expect(registerBlogMediaInput.safeParse(base).success).toBe(true);
    expect(
      registerBlogMediaInput.safeParse({ ...base, width: 10, height: 10 })
        .success,
    ).toBe(true);
    expect(
      registerBlogMediaInput.safeParse({ ...base, width: 10 }).success,
    ).toBe(false);
    expect(
      registerBlogMediaInput.safeParse({ ...base, height: 10 }).success,
    ).toBe(false);
  });

  test("rejects duplicate category ids in a reorder request", () => {
    expect(
      reorderBlogCategoriesInput.safeParse({ ids: ["a", "b"] }).success,
    ).toBe(true);
    expect(
      reorderBlogCategoriesInput.safeParse({ ids: ["a", "a"] }).success,
    ).toBe(false);
  });
});

test("preserves spaces around formatted blog runs", async () => {
  expect(blogRunSchema.parse({ text: "Learn " }).text).toBe("Learn ");
  expect(blogRunSchema.parse({ text: " together" }).text).toBe(" together");
});

test("manual blog names are optional, bounded and normalize blank values", async () => {
  const { createBlogArticleInput } =
    await import("../../modules/blog/blog.types");
  expect(
    createBlogArticleInput.parse({
      featuredTutorName: "  Kak Gita  ",
      reviewedByName: " ",
    }),
  ).toMatchObject({ featuredTutorName: "Kak Gita", reviewedByName: null });
  expect(
    createBlogArticleInput.safeParse({ featuredTutorName: "a".repeat(201) })
      .success,
  ).toBe(false);
});

describe("blog table blocks", () => {
  const table = {
    type: "table",
    header: [[{ text: "A" }], [{ text: "B", bold: true }]],
    rows: [
      [[{ text: "1" }], [{ text: "2", href: "https://example.com" }]],
      [[{ text: "3" }], [{ text: "4" }]],
    ],
  };

  test("accepts a simple table with an optional header", () => {
    expect(blogBlockSchema.safeParse(table).success).toBe(true);
    expect(
      blogBlockSchema.safeParse({
        type: "table",
        rows: [[[{ text: "only" }]]],
      }).success,
    ).toBe(true);
  });

  test("rejects mismatched rows, too many columns, and oversized cells", () => {
    expect(
      blogBlockSchema.safeParse({
        ...table,
        rows: [[[{ text: "1" }]], [[{ text: "2" }], [{ text: "3" }]]],
      }).success,
    ).toBe(false);
    expect(
      blogBlockSchema.safeParse({
        type: "table",
        rows: [
          Array.from({ length: 9 }, (_, index) => [{ text: String(index) }]),
        ],
      }).success,
    ).toBe(false);
    expect(
      blogBlockSchema.safeParse({
        type: "table",
        rows: [[[{ text: "x".repeat(501) }]]],
      }).success,
    ).toBe(false);
  });

  test("accepts 150 blocks and rejects 151", () => {
    const block = { type: "paragraph", runs: [{ text: "Text" }] };
    expect(blogBodySchema.safeParse(Array(150).fill(block)).success).toBe(true);
    expect(blogBodySchema.safeParse(Array(151).fill(block)).success).toBe(
      false,
    );
  });
});
