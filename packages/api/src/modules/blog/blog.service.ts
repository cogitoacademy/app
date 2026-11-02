import type { StoragePort } from "../../lib/storage";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../audit/audit.service";
import { isValidUploadKey } from "../../lib/request-id";
import type {
  BlogBlock,
  BlogFaqItem,
  BlogKeyFact,
  BlogLocale,
} from "@cogito-app/db/schema/blog";
import type { blogArticleVersion } from "@cogito-app/db/schema/blog";
import type { BlogRepo, BlogCursor } from "./blog.repo";
import {
  BlogArticleArchivedError,
  BlogCategoryInUseError,
  BlogCategoryInvalidError,
  BlogMediaInvalidError,
  BlogNotFoundError,
  BlogPublishInvalidError,
  BlogSlugImmutableError,
  BlogSlugTakenError,
  BlogVersionConflictError,
  BlogVersionNotFoundError,
} from "./blog.errors";
import type {
  AdminBlogArticleDto,
  AdminBlogCategoryDto,
  AdminBlogListRowDto,
  AdminBlogVersionDto,
  BlogCategoryRefDto,
  BlogMediaDto,
  BlogTutorRefDto,
  CreateBlogArticleInput,
  CreateBlogCategoryInput,
  PublicBlogArticleDto,
  PublicBlogCardDto,
  PublicBlogCategoryDto,
  PublicBlogSitemapEntry,
  RegisterBlogMediaInput,
  ReplaceRelatedBlogArticlesInput,
  SaveBlogVersionInput,
  UpdateBlogArticleInput,
  UpdateBlogCategoryInput,
} from "./blog.types";
import { normalizeEmbedUrl } from "./blog.types";

type VersionRow = typeof blogArticleVersion.$inferSelect;

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function nonNullIso(value: Date | string): string {
  return iso(value) ?? new Date(0).toISOString();
}

function pick(locale: BlogLocale, id: string | null, en: string | null) {
  return locale === "id" ? (id ?? en) : en;
}

function cursorFrom(value?: string): BlogCursor | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const [time, id] = decoded.split("|");
    if (!time || !id) return null;
    const date = new Date(time);
    return { updatedAt: date, id };
  } catch {
    return null;
  }
}

function cursorTo(value: { updatedAt: Date; id: string }) {
  return Buffer.from(`${value.updatedAt.toISOString()}|${value.id}`).toString(
    "base64url",
  );
}

function bodyText(blocks: BlogBlock[]): string[] {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case "heading":
        return [block.text];
      case "paragraph":
        return block.runs.map((run) => run.text);
      case "list":
        return block.items.flatMap((item) => item.map((run) => run.text));
      case "quote":
        return block.runs.map((run) => run.text);
      case "callout":
        return [block.title, ...block.runs.map((run) => run.text)];
      case "image":
        return [block.alt, block.caption ?? ""];
      case "embed":
        return [];
    }
  });
}

function readingMinutes(input: {
  title: string;
  lead: string;
  body: BlogBlock[];
  faq: BlogFaqItem[];
}) {
  const words = [
    input.title,
    input.lead,
    ...bodyText(input.body),
    ...input.faq.flatMap((item) => [item.question, item.answer]),
  ]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function bodyMediaIds(blocks: BlogBlock[]) {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === "image") ids.add(block.mediaId);
    if (block.type === "embed" && block.posterMediaId) {
      ids.add(block.posterMediaId);
    }
  }
  return [...ids];
}

function normalizeBody(blocks: BlogBlock[]): BlogBlock[] {
  return blocks.map((block) =>
    block.type === "embed"
      ? {
          ...block,
          url: normalizeEmbedUrl(block.provider, block.url),
        }
      : block,
  );
}

export function createBlogService(deps: {
  repo: BlogRepo;
  storage: StoragePort;
  db: DbType;
  audit: AuditPort;
}) {
  const { repo, storage, db, audit } = deps;

  function mediaDto(row: {
    id: string;
    storageKey: string;
    filename: string;
    contentType: string;
    width: number | null;
    height: number | null;
    byteSize: number | null;
  }): BlogMediaDto {
    return {
      id: row.id,
      url: storage.resolvePublicUrl(row.storageKey),
      filename: row.filename,
      contentType: row.contentType,
      width: row.width,
      height: row.height,
      byteSize: row.byteSize,
    };
  }

  function categoryRef(row: {
    id: string;
    slugId: string;
    slugEn: string;
    titleId: string;
    titleEn: string;
    parentId: string | null;
  }): BlogCategoryRefDto {
    return {
      id: row.id,
      slug: row.slugId,
      title: row.titleId,
      parentId: row.parentId,
    };
  }

  function versionDto(row: VersionRow): AdminBlogVersionDto {
    return {
      id: row.id,
      articleId: row.articleId,
      locale: row.locale as BlogLocale,
      slug: row.slug,
      title: row.title,
      seoTitle: row.seoTitle,
      metaDescription: row.metaDescription,
      lead: row.lead,
      mainKeyword: row.mainKeyword,
      secondaryKeywords: row.secondaryKeywords ?? null,
      keyFacts: row.keyFacts as BlogKeyFact[],
      body: row.body as BlogBlock[],
      faq: row.faq as BlogFaqItem[],
      heroAlt: row.heroAlt,
      readingMinutes: row.readingMinutes,
      status: row.status as AdminBlogVersionDto["status"],
      publishedAt: iso(row.publishedAt),
      version: row.version,
      updatedAt: nonNullIso(row.updatedAt),
    };
  }

  function publicCard(
    row: {
      articleId: string;
      slug: string;
      title: string;
      excerpt: string;
      publishedAt: Date | null;
      updatedAt: Date;
      readingMinutes: number;
      categorySlugId: string;
      categorySlugEn: string;
      categoryTitleId: string;
      categoryTitleEn: string;
      subcategorySlugId: string | null;
      subcategorySlugEn: string | null;
      subcategoryTitleId: string | null;
      subcategoryTitleEn: string | null;
      heroUrlKey: string | null;
      heroWidth: number | null;
      heroHeight: number | null;
      heroAlt: string | null;
      tutorName: string | null;
    },
    locale: BlogLocale,
  ): PublicBlogCardDto {
    return {
      id: row.articleId,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      hero: row.heroUrlKey
        ? {
            url: storage.resolvePublicUrl(row.heroUrlKey),
            width: row.heroWidth,
            height: row.heroHeight,
            alt: row.heroAlt,
          }
        : null,
      category: {
        slug:
          pick(locale, row.categorySlugId, row.categorySlugEn) ??
          row.categorySlugId,
        title:
          pick(locale, row.categoryTitleId, row.categoryTitleEn) ??
          row.categoryTitleId,
      },
      subcategory:
        row.subcategorySlugId && row.subcategorySlugEn
          ? {
              slug:
                locale === "id" ? row.subcategorySlugId : row.subcategorySlugEn,
              title:
                pick(locale, row.subcategoryTitleId, row.subcategoryTitleEn) ??
                row.subcategoryTitleId ??
                "",
            }
          : null,
      tutorName: row.tutorName,
      publishedAt: iso(row.publishedAt) ?? new Date(0).toISOString(),
      updatedAt: nonNullIso(row.updatedAt),
      readingMinutes: row.readingMinutes,
    };
  }

  async function ensureCategory(id: string) {
    const category = await repo.categoryById(id);
    if (!category) throw new BlogNotFoundError(id);
    return category;
  }

  async function ensureTutors(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return;
    const rows = await repo.tutorsByIds(unique);
    if (rows.length !== unique.length) {
      throw new BlogNotFoundError(
        unique.find((id) => !rows.some((r) => r.id === id)) ?? "",
      );
    }
  }

  async function ensureSubcategory(
    categoryId: string,
    subcategoryId: string | null | undefined,
  ) {
    if (!subcategoryId) return;
    const sub = await repo.categoryById(subcategoryId);
    if (!sub) throw new BlogNotFoundError(subcategoryId);
    if (sub.parentId !== categoryId) {
      throw new BlogCategoryInvalidError(
        "Subcategory must belong to the selected category.",
      );
    }
  }

  async function ensureVersionMedia(body: BlogBlock[]) {
    const ids = bodyMediaIds(body);
    if (ids.length === 0) return;
    const rows = await repo.mediaByIds(ids);
    if (rows.length !== ids.length) {
      const missing = ids.find((id) => !rows.some((row) => row.id === id));
      throw new BlogMediaInvalidError(
        "Body references an unregistered image.",
        {
          mediaId: missing,
        },
      );
    }
  }

  function missingPublishFields(input: {
    version: VersionRow;
    heroMediaId: string | null;
    gallery: Array<{ altId: string | null; altEn: string | null }>;
  }) {
    const missing: string[] = [];
    const version = input.version;
    if (!version.title.trim()) missing.push("title");
    if (!version.seoTitle.trim()) missing.push("seoTitle");
    if (!version.slug.trim()) missing.push("slug");
    if (!version.metaDescription.trim()) missing.push("metaDescription");
    if (!version.lead.trim()) missing.push("lead");
    if ((version.body as BlogBlock[]).length === 0) missing.push("body");
    if (!input.heroMediaId) missing.push("heroMedia");
    if (!version.heroAlt?.trim()) missing.push("heroAlt");
    if ((version.keyFacts as BlogKeyFact[]).length === 0)
      missing.push("keyFacts");
    if (
      input.gallery.some((image) =>
        version.locale === "id" ? !image.altId?.trim() : !image.altEn?.trim(),
      )
    ) {
      missing.push(version.locale === "id" ? "galleryAltId" : "galleryAltEn");
    }
    return missing;
  }

  async function listCategoriesAdmin(): Promise<AdminBlogCategoryDto[]> {
    const [categories, references] = await Promise.all([
      repo.listCategoriesAdmin(),
      repo.articleCountsByCategory(),
    ]);
    return categories.map((category) => ({
      id: category.id,
      parentId: category.parentId,
      titleId: category.titleId,
      titleEn: category.titleEn,
      slugId: category.slugId,
      slugEn: category.slugEn,
      introId: category.introId,
      introEn: category.introEn,
      isActive: category.isActive,
      version: category.version,
      articleCount: references.filter(
        (row) =>
          row.categoryId === category.id || row.subcategoryId === category.id,
      ).length,
    }));
  }

  return {
    async listAdmin(input: {
      status?: string;
      locale?: string;
      cursor?: string;
      limit: number;
    }): Promise<{ rows: AdminBlogListRowDto[]; nextCursor: string | null }> {
      const rows = await repo.listAdminArticles({
        status: input.status,
        locale: input.locale,
        limit: input.limit,
        cursor: cursorFrom(input.cursor),
      });
      const page = rows.slice(0, input.limit);
      const versions = await repo.versionsForArticles(
        page.map((row) => row.id),
      );
      const mapped = page.map((row) => {
        const id = versions.find(
          (v) => v.articleId === row.id && v.locale === "id",
        );
        const en = versions.find(
          (v) => v.articleId === row.id && v.locale === "en",
        );
        return {
          id: row.id,
          categoryId: row.categoryId,
          categoryTitle:
            pick("id", row.categoryTitleId, row.categoryTitleEn) ?? "",
          titleId: id?.title ?? null,
          titleEn: en?.title ?? null,
          statusId: (id?.status as AdminBlogListRowDto["statusId"]) ?? null,
          statusEn: (en?.status as AdminBlogListRowDto["statusEn"]) ?? null,
          updatedAt: nonNullIso(row.updatedAt),
          archivedAt: iso(row.archivedAt),
        };
      });
      const last = page.at(-1);
      return {
        rows: mapped,
        nextCursor:
          rows.length > input.limit && last
            ? cursorTo({ updatedAt: last.updatedAt, id: last.id })
            : null,
      };
    },

    async getAdmin(articleId: string): Promise<AdminBlogArticleDto> {
      const article = await repo.articleById(articleId);
      if (!article) throw new BlogNotFoundError(articleId);
      const category = await ensureCategory(article.categoryId);
      const subcategory = article.subcategoryId
        ? await repo.categoryById(article.subcategoryId)
        : undefined;
      const hero = article.heroMediaId
        ? await repo.mediaById(article.heroMediaId)
        : undefined;
      const gallery = await repo.galleryForArticle(article.id);
      const tutorIds = [
        article.featuredTutorId,
        article.reviewedByTutorId,
      ].filter((id): id is string => !!id);
      const tutors = await repo.tutorsByIds(tutorIds);
      const versions = await repo.versionsForArticle(article.id);
      const relatedArticleIds = await repo.relatedIds(article.id);

      const toTutor = (id: string | null): BlogTutorRefDto | null => {
        if (!id) return null;
        const tutor = tutors.find((row) => row.id === id);
        return tutor ? { id: tutor.id, name: tutor.name } : null;
      };

      return {
        id: article.id,
        category: categoryRef(category),
        subcategory: subcategory ? categoryRef(subcategory) : null,
        heroMedia: hero ? mediaDto(hero) : null,
        gallery: gallery.map((row) => ({
          ...mediaDto(row.media),
          sortOrder: row.sortOrder,
          altId: row.altId,
          altEn: row.altEn,
        })),
        featuredTutor: toTutor(article.featuredTutorId),
        reviewedByTutor: toTutor(article.reviewedByTutorId),
        relatedArticleIds,
        internalNotes: article.internalNotes,
        archivedAt: iso(article.archivedAt),
        version: article.version,
        versions: {
          id: versions.find((row) => row.locale === "id")
            ? versionDto(versions.find((row) => row.locale === "id")!)
            : null,
          en: versions.find((row) => row.locale === "en")
            ? versionDto(versions.find((row) => row.locale === "en")!)
            : null,
        },
        createdAt: nonNullIso(article.createdAt),
        updatedAt: nonNullIso(article.updatedAt),
      };
    },

    async createArticle(input: CreateBlogArticleInput, actorId: string) {
      await ensureCategory(input.categoryId);
      await ensureSubcategory(input.categoryId, input.subcategoryId);
      if (input.heroMediaId) {
        const media = await repo.mediaById(input.heroMediaId);
        if (!media)
          throw new BlogMediaInvalidError("Hero image is not registered.");
      }
      await ensureTutors([
        ...(input.featuredTutorId ? [input.featuredTutorId] : []),
        ...(input.reviewedByTutorId ? [input.reviewedByTutorId] : []),
      ]);
      const row = await repo.createArticle({
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId ?? null,
        heroMediaId: input.heroMediaId ?? null,
        featuredTutorId: input.featuredTutorId ?? null,
        reviewedByTutorId: input.reviewedByTutorId ?? null,
        internalNotes: input.internalNotes ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      });
      return { articleId: row.id, version: row.version };
    },

    async updateArticle(input: UpdateBlogArticleInput, actorId: string) {
      const article = await repo.articleById(input.articleId);
      if (!article) throw new BlogNotFoundError(input.articleId);
      if (article.archivedAt) throw new BlogArticleArchivedError(article.id);
      const categoryId = input.categoryId ?? article.categoryId;
      await ensureCategory(categoryId);
      await ensureSubcategory(categoryId, input.subcategoryId);
      if (input.heroMediaId) {
        const media = await repo.mediaById(input.heroMediaId);
        if (!media)
          throw new BlogMediaInvalidError("Hero image is not registered.");
      }
      await ensureTutors([
        ...(input.featuredTutorId ? [input.featuredTutorId] : []),
        ...(input.reviewedByTutorId ? [input.reviewedByTutorId] : []),
      ]);
      const row = await repo.updateArticleIfVersion(
        article.id,
        input.expectedVersion,
        {
          categoryId,
          subcategoryId: input.subcategoryId ?? null,
          heroMediaId: input.heroMediaId ?? null,
          featuredTutorId: input.featuredTutorId ?? null,
          reviewedByTutorId: input.reviewedByTutorId ?? null,
          internalNotes: input.internalNotes ?? null,
          updatedBy: actorId,
        },
      );
      if (!row)
        throw new BlogVersionConflictError(
          article.id,
          input.expectedVersion,
          article.version,
        );
      return { articleId: row.id, version: row.version };
    },

    async saveVersion(input: SaveBlogVersionInput) {
      const article = await repo.articleById(input.articleId);
      if (!article) throw new BlogNotFoundError(input.articleId);
      if (article.archivedAt) throw new BlogArticleArchivedError(article.id);

      const body = normalizeBody(input.body);
      await ensureVersionMedia(body);

      const owner = await repo.slugOwner(input.locale, input.slug);
      if (owner && owner.articleId !== input.articleId) {
        throw new BlogSlugTakenError(input.slug, input.locale);
      }

      const existing = await repo.versionByArticleLocale(
        input.articleId,
        input.locale,
      );
      const values = {
        slug: input.slug,
        title: input.title,
        seoTitle: input.seoTitle,
        metaDescription: input.metaDescription,
        lead: input.lead,
        mainKeyword: input.mainKeyword ?? null,
        secondaryKeywords: input.secondaryKeywords ?? null,
        keyFacts: input.keyFacts,
        body,
        faq: input.faq,
        heroAlt: input.heroAlt ?? null,
        readingMinutes: readingMinutes({
          title: input.title,
          lead: input.lead,
          body,
          faq: input.faq,
        }),
      };

      if (!existing) {
        if (input.expectedVersion !== 0) {
          throw new BlogVersionConflictError(
            `${input.articleId}:${input.locale}`,
            input.expectedVersion,
            0,
          );
        }
        const row = await repo.insertVersion({
          articleId: input.articleId,
          locale: input.locale,
          ...values,
        });
        return versionDto(row);
      }

      if (existing.publishedAt && existing.slug !== input.slug) {
        throw new BlogSlugImmutableError(existing.slug);
      }

      const row = await repo.updateVersionIfVersion(
        existing.id,
        input.expectedVersion,
        values,
      );
      if (!row) {
        throw new BlogVersionConflictError(
          existing.id,
          input.expectedVersion,
          existing.version,
        );
      }
      return versionDto(row);
    },

    async publishVersion(
      input: {
        articleId: string;
        locale: BlogLocale;
        expectedVersion: number;
      },
      actorId: string,
    ) {
      const article = await repo.articleById(input.articleId);
      if (!article) throw new BlogNotFoundError(input.articleId);
      if (article.archivedAt) throw new BlogArticleArchivedError(article.id);

      const version = await repo.versionByArticleLocale(
        input.articleId,
        input.locale,
      );
      if (!version)
        throw new BlogVersionNotFoundError(input.articleId, input.locale);

      const gallery = await repo.galleryForArticle(article.id);
      const missing = missingPublishFields({
        version,
        heroMediaId: article.heroMediaId,
        gallery,
      });
      if (missing.length > 0) throw new BlogPublishInvalidError(missing);

      const row = await repo.updateVersionIfVersion(
        version.id,
        input.expectedVersion,
        {
          status: "published",
          publishedAt: version.publishedAt ?? new Date(),
        },
      );
      if (!row) {
        const current = await repo.versionById(version.id);
        throw new BlogVersionConflictError(
          version.id,
          input.expectedVersion,
          current?.version ?? version.version,
        );
      }
      await audit.record({
        db,
        actorId,
        actorType: "admin",
        action: "blog.version.publish",
        targetId: version.id,
        targetType: "blog_article_version",
        beforeState: { status: version.status },
        afterState: { status: row.status },
        details: { articleId: version.articleId, locale: version.locale },
      });
      return versionDto(row);
    },

    async unpublishVersion(
      input: {
        articleId: string;
        locale: BlogLocale;
        expectedVersion: number;
      },
      actorId: string,
    ) {
      const version = await repo.versionByArticleLocale(
        input.articleId,
        input.locale,
      );
      if (!version)
        throw new BlogVersionNotFoundError(input.articleId, input.locale);
      const row = await repo.updateVersionIfVersion(
        version.id,
        input.expectedVersion,
        {
          status: "draft",
        },
      );
      if (!row) {
        const current = await repo.versionById(version.id);
        throw new BlogVersionConflictError(
          version.id,
          input.expectedVersion,
          current?.version ?? version.version,
        );
      }
      await audit.record({
        db,
        actorId,
        actorType: "admin",
        action: "blog.version.unpublish",
        targetId: version.id,
        targetType: "blog_article_version",
        beforeState: { status: version.status },
        afterState: { status: row.status },
        details: { articleId: version.articleId, locale: version.locale },
      });
      return versionDto(row);
    },

    async archiveArticle(
      input: {
        articleId: string;
        expectedVersion: number;
      },
      actorId: string,
    ) {
      const article = await repo.articleById(input.articleId);
      if (!article) throw new BlogNotFoundError(input.articleId);
      if (article.version !== input.expectedVersion) {
        throw new BlogVersionConflictError(
          article.id,
          input.expectedVersion,
          article.version,
        );
      }
      const row = await repo.archiveArticle(article.id);
      if (!row) throw new BlogNotFoundError(article.id);
      await audit.record({
        db,
        actorId,
        actorType: "admin",
        action: "blog.article.archive",
        targetId: article.id,
        targetType: "blog_article",
        beforeState: { archivedAt: article.archivedAt },
        afterState: { archivedAt: row.archivedAt },
      });
      return { articleId: row.id };
    },

    async replaceRelated(input: ReplaceRelatedBlogArticlesInput) {
      const article = await repo.articleById(input.articleId);
      if (!article) throw new BlogNotFoundError(input.articleId);
      if (article.version !== input.expectedVersion) {
        throw new BlogVersionConflictError(
          article.id,
          input.expectedVersion,
          article.version,
        );
      }
      for (const id of input.relatedArticleIds) {
        const related = await repo.articleById(id);
        if (!related) throw new BlogNotFoundError(id);
        if (related.archivedAt) throw new BlogArticleArchivedError(id);
      }
      await repo.replaceRelated(article.id, input.relatedArticleIds);
      return { articleId: article.id };
    },

    async replaceGallery(input: {
      articleId: string;
      expectedVersion: number;
      images: Array<{
        mediaId: string;
        altId: string | null;
        altEn: string | null;
      }>;
    }) {
      const article = await repo.articleById(input.articleId);
      if (!article) throw new BlogNotFoundError(input.articleId);
      if (article.version !== input.expectedVersion) {
        throw new BlogVersionConflictError(
          article.id,
          input.expectedVersion,
          article.version,
        );
      }
      const media = await repo.mediaByIds(
        input.images.map((image) => image.mediaId),
      );
      if (
        media.length !==
        new Set(input.images.map((image) => image.mediaId)).size
      ) {
        throw new BlogMediaInvalidError(
          "Gallery references an unregistered image.",
        );
      }
      await repo.replaceGallery(
        article.id,
        input.images.map((image, sortOrder) => ({
          mediaId: image.mediaId,
          sortOrder,
          altId: image.altId,
          altEn: image.altEn,
        })),
      );
      return { articleId: article.id };
    },

    async registerMedia(input: RegisterBlogMediaInput, actorId: string) {
      if (
        !isValidUploadKey(input.storageKey) ||
        !input.storageKey.startsWith(`${actorId}/`)
      ) {
        throw new BlogMediaInvalidError(
          "Upload the image through your own admin session before registering it.",
        );
      }
      const existing = await repo.mediaByStorageKey(input.storageKey);
      if (existing) {
        return mediaDto(existing);
      }
      const row = await repo.insertMedia({
        storageKey: input.storageKey,
        filename: input.filename,
        contentType: input.contentType,
        width: input.width ?? null,
        height: input.height ?? null,
        byteSize: input.byteSize ?? null,
        createdBy: actorId,
      });
      await audit.record({
        db,
        actorId,
        actorType: "admin",
        action: "blog.media.register",
        targetId: row.id,
        targetType: "blog_media",
        details: {
          storageKey: row.storageKey,
          contentType: row.contentType,
        },
      });
      return mediaDto(row);
    },

    async listCategoriesAdmin(): Promise<AdminBlogCategoryDto[]> {
      return listCategoriesAdmin();
    },

    async listTutorOptions(): Promise<BlogTutorRefDto[]> {
      return repo.listTutors();
    },

    async createCategory(input: CreateBlogCategoryInput) {
      if (input.parentId) {
        const parent = await repo.categoryById(input.parentId);
        if (!parent) throw new BlogNotFoundError(input.parentId);
        if (parent.parentId) {
          throw new BlogCategoryInvalidError(
            "Categories support only one level.",
          );
        }
      }
      if (await repo.categorySlugOwner("id", input.slugId)) {
        throw new BlogSlugTakenError(input.slugId, "id");
      }
      if (await repo.categorySlugOwner("en", input.slugEn)) {
        throw new BlogSlugTakenError(input.slugEn, "en");
      }
      const existing = await repo.listCategoriesAdmin();
      const sortOrder =
        existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
      const row = await repo.createCategory({
        parentId: input.parentId ?? null,
        titleId: input.titleId,
        titleEn: input.titleEn,
        slugId: input.slugId,
        slugEn: input.slugEn,
        introId: input.introId ?? null,
        introEn: input.introEn ?? null,
        isActive: input.isActive,
        sortOrder,
      });
      return {
        id: row.id,
        version: row.version,
      };
    },

    async updateCategory(input: UpdateBlogCategoryInput) {
      const category = await repo.categoryById(input.categoryId);
      if (!category) throw new BlogNotFoundError(input.categoryId);
      if (input.parentId === category.id) {
        throw new BlogCategoryInvalidError(
          "A category cannot be its own parent.",
        );
      }
      if (input.parentId) {
        const parent = await repo.categoryById(input.parentId);
        if (!parent) throw new BlogNotFoundError(input.parentId);
        if (parent.parentId) {
          throw new BlogCategoryInvalidError(
            "Categories support only one level.",
          );
        }
      }
      if (await repo.categorySlugOwner("id", input.slugId, category.id)) {
        throw new BlogSlugTakenError(input.slugId, "id");
      }
      if (await repo.categorySlugOwner("en", input.slugEn, category.id)) {
        throw new BlogSlugTakenError(input.slugEn, "en");
      }
      if (
        !input.isActive &&
        (await repo.publishedArticleUsesCategory(category.id))
      ) {
        throw new BlogCategoryInUseError(category.id);
      }
      const row = await repo.updateCategoryIfVersion(
        category.id,
        input.expectedVersion,
        {
          parentId: input.parentId ?? null,
          titleId: input.titleId,
          titleEn: input.titleEn,
          slugId: input.slugId,
          slugEn: input.slugEn,
          introId: input.introId ?? null,
          introEn: input.introEn ?? null,
          isActive: input.isActive,
        },
      );
      if (!row) {
        throw new BlogVersionConflictError(
          category.id,
          input.expectedVersion,
          category.version,
        );
      }
      return { id: row.id, version: row.version };
    },

    async reorderCategories(ids: string[]) {
      await repo.reorderCategories(ids);
      return listCategoriesAdmin();
    },

    async listPublic(input: {
      locale: BlogLocale;
      cursor?: string;
      limit: number;
    }): Promise<{ rows: PublicBlogCardDto[]; nextCursor: string | null }> {
      const rows = await repo.listPublished({
        locale: input.locale,
        limit: input.limit,
        cursor: cursorFrom(input.cursor),
      });
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        rows: page.map((row) => publicCard(row, input.locale)),
        nextCursor:
          rows.length > input.limit && last?.publishedAt
            ? Buffer.from(
                `${last.publishedAt.toISOString()}|${last.versionId}`,
              ).toString("base64url")
            : null,
      };
    },

    async getPublic(input: {
      locale: BlogLocale;
      slug: string;
    }): Promise<PublicBlogArticleDto> {
      const row = await repo.getPublishedBySlug(input);
      if (!row) throw new BlogNotFoundError(input.slug);

      const body = row.body as BlogBlock[];
      const mediaIds = bodyMediaIds(body);
      const mediaRows = await repo.mediaByIds(mediaIds);
      const mediaMap: Record<string, BlogMediaDto> = {};
      for (const media of mediaRows) {
        mediaMap[media.id] = mediaDto(media);
      }

      const gallery = await repo.publishedGallery(row.articleId);
      const alternate = await repo.publishedAlternate(
        row.articleId,
        input.locale === "id" ? "en" : "id",
      );

      const relatedIds = await repo.relatedIds(row.articleId);
      const relatedRows = await repo.publishedCardsByIds(
        input.locale,
        relatedIds,
      );
      const related = relatedIds
        .map((id) =>
          relatedRows.find((relatedRow) => relatedRow.articleId === id),
        )
        .filter(
          (relatedRow): relatedRow is NonNullable<typeof relatedRow> =>
            !!relatedRow,
        )
        .map((relatedRow) => publicCard(relatedRow, input.locale));

      return {
        ...publicCard(row, input.locale),
        lead: row.lead,
        seoTitle: row.seoTitle,
        metaDescription: row.metaDescription,
        keyFacts: row.keyFacts as BlogKeyFact[],
        body,
        faq: row.faq as BlogFaqItem[],
        gallery: gallery.map((image) => ({
          url: storage.resolvePublicUrl(image.storageKey),
          width: image.width,
          height: image.height,
          alt: pick(input.locale, image.altId, image.altEn),
        })),
        media: mediaMap,
        related,
        alternate: alternate
          ? {
              locale: alternate.locale as BlogLocale,
              slug: alternate.slug,
            }
          : null,
      };
    },

    async listPublicCategories(
      locale: BlogLocale,
    ): Promise<PublicBlogCategoryDto[]> {
      const rows = await repo.listCategoriesWithCounts(locale);
      return rows.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        slug: pick(locale, row.slugId, row.slugEn) ?? row.slugId,
        title: pick(locale, row.titleId, row.titleEn) ?? row.titleId,
        intro: pick(locale, row.introId, row.introEn),
        articleCount: row.count,
      }));
    },

    async sitemap(): Promise<PublicBlogSitemapEntry[]> {
      const rows = await repo.sitemapRows();
      const grouped = new Map<string, typeof rows>();
      for (const row of rows) {
        const group = grouped.get(row.articleId) ?? [];
        group.push(row);
        grouped.set(row.articleId, group);
      }
      return rows.map((row) => {
        const sibling = grouped
          .get(row.articleId)
          ?.find((item) => item.locale !== row.locale);
        return {
          articleId: row.articleId,
          locale: row.locale as BlogLocale,
          slug: row.slug,
          updatedAt: nonNullIso(row.updatedAt),
          alternate: sibling
            ? {
                locale: sibling.locale as BlogLocale,
                slug: sibling.slug,
              }
            : null,
        };
      });
    },
  };
}

export type BlogService = ReturnType<typeof createBlogService>;
