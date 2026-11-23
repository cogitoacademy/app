import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { db } from "@cogito-app/db";
import {
  blogArticle,
  blogArticleVersion,
  blogCategory,
  blogMedia,
  user,
} from "@cogito-app/db/schema";
import { eq, inArray } from "drizzle-orm";

import type { Context } from "../../context";
import { createBlogModule, createBlogRouter } from "../../modules/blog";
import type { StoragePort } from "../../lib/storage";
import { createTestUser } from "../helpers/factories";

function assertDedicatedTestDatabase() {
  let parsedUrl: URL | undefined;
  try {
    if (process.env.DATABASE_URL) {
      parsedUrl = new URL(process.env.DATABASE_URL);
    }
  } catch {
    parsedUrl = undefined;
  }
  const host = parsedUrl?.hostname.toLowerCase();
  const databaseName = parsedUrl?.pathname.replace(/^\/+/, "");
  if (
    process.env.NODE_ENV !== "test" ||
    databaseName !== "cogito-test" ||
    !["localhost", "127.0.0.1", "::1"].includes(host ?? "")
  ) {
    throw new Error(
      "Blog integration tests require the local cogito-test database.",
    );
  }
}

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

function context(adminId: string, role: "admin" | null): Context {
  return {
    session: role ? { user: { id: adminId, role, emailVerified: true } } : null,
    services: {} as Context["services"],
    headers: new Headers(),
  } as Context;
}

function createClients(adminId: string) {
  const module = createBlogModule({
    db,
    storage,
    audit: { record: async () => undefined },
  });
  const router = createBlogRouter(module.handler);
  return {
    adminClient: createRouterClient(router, {
      context: context(adminId, "admin"),
    }),
    publicClient: createRouterClient(router, {
      context: context(adminId, null),
    }),
  };
}

const completeVersion = {
  title: "Belajar Matematika Tanpa Panik",
  seoTitle: "Belajar Matematika Tanpa Panik",
  metaDescription: "Cara belajar matematika yang tenang dan terukur.",
  lead: "Matematika tidak harus menakutkan.",
  mainKeyword: "belajar matematika",
  secondaryKeywords: ["tips belajar"],
  keyFacts: [{ text: "Latihan pendek setiap hari lebih efektif." }],
  body: [
    { type: "heading", level: 2, text: "Mulai dari satu soal" },
    { type: "paragraph", runs: [{ text: "Kerjakan satu soal lebih dulu." }] },
    {
      type: "table",
      header: [[{ text: "Kompetisi" }], [{ text: "Jenjang" }]],
      rows: [
        [[{ text: "MUN" }], [{ text: "SMA" }]],
        [[{ text: "WSC" }], [{ text: "SMP" }]],
      ],
    },
  ] as const,
  faq: [{ question: "Apakah harus setiap hari?", answer: "Idealnya iya." }],
  heroAlt: "Siswa belajar matematika",
};

describe("Blog Postgres integration", () => {
  const articleIds: string[] = [];
  const categoryIds: string[] = [];
  const mediaIds: string[] = [];
  let safeToCleanup = false;
  let clients: ReturnType<typeof createClients>;
  let adminId = "";
  let categoryId = "";
  let mediaId = "";

  beforeAll(async () => {
    assertDedicatedTestDatabase();
    safeToCleanup = true;
    const admin = await createTestUser(
      `blog-test-admin-${Date.now()}@cogito.test`,
      "admin",
    );
    adminId = admin.id;
    clients = createClients(adminId);
  });

  afterAll(async () => {
    if (!safeToCleanup) return;
    assertDedicatedTestDatabase();
    if (articleIds.length > 0) {
      await db
        .delete(blogArticleVersion)
        .where(inArray(blogArticleVersion.articleId, articleIds));
      await db.delete(blogArticle).where(inArray(blogArticle.id, articleIds));
    }
    if (categoryIds.length > 0) {
      await db
        .delete(blogCategory)
        .where(inArray(blogCategory.id, categoryIds));
    }
    if (mediaIds.length > 0) {
      await db.delete(blogMedia).where(inArray(blogMedia.id, mediaIds));
    }
    if (adminId) {
      await db.delete(user).where(eq(user.id, adminId));
    }
  });

  test("creates a category and registers media", async () => {
    const category = await clients.adminClient.adminBlog.categories.create({
      titleId: "Belajar",
      titleEn: "Learning",
      slugId: `belajar-${Date.now()}`,
      slugEn: `learning-${Date.now()}`,
    });
    categoryIds.push(category.id);
    categoryId = category.id;

    const media = await clients.adminClient.adminBlog.registerMedia({
      storageKey: `${adminId}/hero-${Date.now()}.webp`,
      filename: "hero.webp",
      contentType: "image/webp",
      width: 1200,
      height: 800,
      byteSize: 100_000,
    });
    mediaIds.push(media.id);
    mediaId = media.id;

    expect(media.url.startsWith(`https://cdn.test/${adminId}/hero-`)).toBe(
      true,
    );
    expect(category.version).toBe(1);
  });

  test("rejects media registered under another admin prefix", async () => {
    await expect(
      clients.adminClient.adminBlog.registerMedia({
        storageKey: "someone-else/hero.webp",
        filename: "hero.webp",
        contentType: "image/webp",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("publishes a complete language version and serves it publicly", async () => {
    const created = await clients.adminClient.adminBlog.createArticle({
      categoryId,
    });
    articleIds.push(created.articleId);

    await expect(
      clients.adminClient.adminBlog.publishVersion({
        articleId: created.articleId,
        locale: "id",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const slug = `belajar-matematika-${Date.now()}`;
    const saved = await clients.adminClient.adminBlog.saveVersion({
      articleId: created.articleId,
      locale: "id",
      expectedVersion: 0,
      slug,
      heroMediaId: mediaId,
      ...completeVersion,
    });

    await expect(
      clients.adminClient.adminBlog.publishVersion({
        articleId: created.articleId,
        locale: "id",
        expectedVersion: saved.version + 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const published = await clients.adminClient.adminBlog.publishVersion({
      articleId: created.articleId,
      locale: "id",
      expectedVersion: saved.version,
    });
    expect(published.status).toBe("published");

    const article = await clients.publicClient.publicContent.blog.get({
      locale: "id",
      slug,
    });
    expect(article.title).toBe(completeVersion.title);
    expect(article.body.some((block) => block.type === "table")).toBe(true);
    expect(
      article.hero?.url.startsWith(`https://cdn.test/${adminId}/hero-`),
    ).toBe(true);
    expect(article.alternate).toBeNull();

    const list = await clients.publicClient.publicContent.blog.list({
      locale: "id",
      limit: 12,
    });
    expect(list.rows.some((row) => row.slug === slug)).toBe(true);

    const sitemap = await clients.publicClient.publicContent.blog.sitemap({});
    expect(sitemap.some((entry) => entry.slug === slug)).toBe(true);
  });

  test("locks a published slug and unpublishes on request", async () => {
    const articleId = articleIds[0]!;
    const current = await clients.adminClient.adminBlog.get({ articleId });
    const version = current.versions.id!;

    await expect(
      clients.adminClient.adminBlog.saveVersion({
        articleId,
        locale: "id",
        expectedVersion: version.version,
        slug: `${version.slug}-changed`,
        heroMediaId: mediaId,
        ...completeVersion,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const unpublished = await clients.adminClient.adminBlog.unpublishVersion({
      articleId,
      locale: "id",
      expectedVersion: version.version,
    });
    expect(unpublished.status).toBe("draft");

    await expect(
      clients.publicClient.publicContent.blog.get({
        locale: "id",
        slug: version.slug,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("keeps a separate hero image for each language", async () => {
    const enMedia = await clients.adminClient.adminBlog.registerMedia({
      storageKey: `${adminId}/hero-en-${Date.now()}.webp`,
      filename: "hero-en.webp",
      contentType: "image/webp",
      width: 1200,
      height: 800,
      byteSize: 100_000,
    });
    mediaIds.push(enMedia.id);
    const created = await clients.adminClient.adminBlog.createArticle({
      categoryId,
    });
    articleIds.push(created.articleId);
    const savedId = await clients.adminClient.adminBlog.saveVersion({
      articleId: created.articleId,
      locale: "id",
      expectedVersion: 0,
      slug: `hero-id-${Date.now()}`,
      heroMediaId: mediaId,
      ...completeVersion,
    });
    const savedEn = await clients.adminClient.adminBlog.saveVersion({
      articleId: created.articleId,
      locale: "en",
      expectedVersion: 0,
      slug: `hero-en-${Date.now()}`,
      heroMediaId: enMedia.id,
      ...completeVersion,
    });
    expect(savedId.heroMedia?.url).not.toBe(savedEn.heroMedia?.url);

    await clients.adminClient.adminBlog.publishVersion({
      articleId: created.articleId,
      locale: "id",
      expectedVersion: savedId.version,
    });
    await clients.adminClient.adminBlog.publishVersion({
      articleId: created.articleId,
      locale: "en",
      expectedVersion: savedEn.version,
    });

    const [idArticle, enArticle] = await Promise.all([
      clients.publicClient.publicContent.blog.get({
        locale: "id",
        slug: savedId.slug,
      }),
      clients.publicClient.publicContent.blog.get({
        locale: "en",
        slug: savedEn.slug,
      }),
    ]);
    expect(idArticle.hero?.url).toBe(savedId.heroMedia?.url);
    expect(enArticle.hero?.url).toBe(savedEn.heroMedia?.url);
    expect(idArticle.alternate).toEqual({
      locale: "en",
      slug: savedEn.slug,
    });
    expect(enArticle.alternate).toEqual({
      locale: "id",
      slug: savedId.slug,
    });
  });

  test("records student-story consent with a date", async () => {
    const created = await clients.adminClient.adminBlog.createArticle({
      categoryId,
    });
    articleIds.push(created.articleId);
    const current = await clients.adminClient.adminBlog.get({
      articleId: created.articleId,
    });
    await expect(
      clients.adminClient.adminBlog.updateArticle({
        articleId: created.articleId,
        expectedVersion: current.version,
        consentRecorded: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await clients.adminClient.adminBlog.updateArticle({
      articleId: created.articleId,
      expectedVersion: current.version,
      consentRecorded: true,
      consentRecordedAt: "2026-11-20",
      consentNotes: "Guardian form on file",
    });
    const loaded = await clients.adminClient.adminBlog.get({
      articleId: created.articleId,
    });
    expect(loaded.consentRecorded).toBe(true);
    expect(loaded.consentRecordedAt).toBe("2026-11-20");
    expect(loaded.consentNotes).toBe("Guardian form on file");
  });

  test("blocks publishing when required fields are missing", async () => {
    const created = await clients.adminClient.adminBlog.createArticle({
      categoryId,
    });
    articleIds.push(created.articleId);

    const saved = await clients.adminClient.adminBlog.saveVersion({
      articleId: created.articleId,
      locale: "en",
      expectedVersion: 0,
      slug: `draft-only-${Date.now()}`,
    });
    expect(saved.status).toBe("draft");

    await expect(
      clients.adminClient.adminBlog.publishVersion({
        articleId: created.articleId,
        locale: "en",
        expectedVersion: saved.version,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("archives an article and stops edits", async () => {
    const articleId = articleIds[0]!;
    const current = await clients.adminClient.adminBlog.get({ articleId });
    await clients.adminClient.adminBlog.archiveArticle({
      articleId,
      expectedVersion: current.version,
    });

    await expect(
      clients.adminClient.adminBlog.saveVersion({
        articleId,
        locale: "id",
        expectedVersion: current.versions.id!.version,
        slug: current.versions.id!.slug,
        heroMediaId: mediaId,
        ...completeVersion,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
