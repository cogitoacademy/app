import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  blogArticle,
  blogArticleGallery,
  blogArticleRelated,
  blogArticleVersion,
  blogCategory,
  blogMedia,
} from "@cogito-app/db/schema";
import { tutorProfile } from "@cogito-app/db/schema/tutor-profile";
import { user } from "@cogito-app/db/schema/auth";
import type { DbType } from "../../lib/db";
import type { TxClient } from "../../lib/tx";

const rootCategory = alias(blogCategory, "blog_root_category");
const subCategory = alias(blogCategory, "blog_sub_category");

export type BlogCursor = { updatedAt: Date; id: string };

function afterCursor(cursor: BlogCursor | null) {
  if (!cursor) return undefined;
  return or(
    lt(blogArticle.updatedAt, cursor.updatedAt),
    and(
      eq(blogArticle.updatedAt, cursor.updatedAt),
      lt(blogArticle.id, cursor.id),
    ),
  );
}

function afterPublishedCursor(cursor: BlogCursor | null) {
  if (!cursor) return undefined;
  return sql`(${blogArticleVersion.publishedAt}, ${blogArticleVersion.id}) < (${cursor.updatedAt}, ${cursor.id})`;
}

const publicCardSelection = {
  articleId: blogArticleVersion.articleId,
  versionId: blogArticleVersion.id,
  slug: blogArticleVersion.slug,
  title: blogArticleVersion.title,
  excerpt: blogArticleVersion.metaDescription,
  publishedAt: blogArticleVersion.publishedAt,
  updatedAt: blogArticleVersion.updatedAt,
  readingMinutes: blogArticleVersion.readingMinutes,
  categorySlugId: rootCategory.slugId,
  categorySlugEn: rootCategory.slugEn,
  categoryTitleId: rootCategory.titleId,
  categoryTitleEn: rootCategory.titleEn,
  subcategorySlugId: subCategory.slugId,
  subcategorySlugEn: subCategory.slugEn,
  subcategoryTitleId: subCategory.titleId,
  subcategoryTitleEn: subCategory.titleEn,
  heroUrlKey: blogMedia.storageKey,
  heroWidth: blogMedia.width,
  heroHeight: blogMedia.height,
  heroAlt: blogArticleVersion.heroAlt,
  tutorName: sql<
    string | null
  >`coalesce(${user.name}, ${blogArticle.featuredTutorName})`,
} as const;

export function createBlogRepo(db: DbType) {
  return {
    async listAdminArticles(input: {
      status?: string;
      locale?: string;
      limit: number;
      cursor: BlogCursor | null;
    }) {
      const versionFilter =
        input.status && input.locale
          ? inArray(
              blogArticle.id,
              db
                .select({ id: blogArticleVersion.articleId })
                .from(blogArticleVersion)
                .where(
                  and(
                    eq(blogArticleVersion.status, input.status),
                    eq(blogArticleVersion.locale, input.locale),
                  ),
                ),
            )
          : input.status
            ? inArray(
                blogArticle.id,
                db
                  .select({ id: blogArticleVersion.articleId })
                  .from(blogArticleVersion)
                  .where(eq(blogArticleVersion.status, input.status)),
              )
            : input.locale
              ? inArray(
                  blogArticle.id,
                  db
                    .select({ id: blogArticleVersion.articleId })
                    .from(blogArticleVersion)
                    .where(eq(blogArticleVersion.locale, input.locale)),
                )
              : undefined;

      return db
        .select({
          id: blogArticle.id,
          categoryId: blogArticle.categoryId,
          categoryTitleId: rootCategory.titleId,
          categoryTitleEn: rootCategory.titleEn,
          updatedAt: blogArticle.updatedAt,
          archivedAt: blogArticle.archivedAt,
        })
        .from(blogArticle)
        .leftJoin(rootCategory, eq(rootCategory.id, blogArticle.categoryId))
        .where(and(versionFilter, afterCursor(input.cursor)))
        .orderBy(desc(blogArticle.updatedAt), desc(blogArticle.id))
        .limit(input.limit + 1);
    },

    async versionsForArticles(articleIds: string[]) {
      if (articleIds.length === 0) return [];
      return db
        .select()
        .from(blogArticleVersion)
        .where(inArray(blogArticleVersion.articleId, articleIds))
        .orderBy(asc(blogArticleVersion.locale));
    },

    async articleById(id: string) {
      const [row] = await db
        .select()
        .from(blogArticle)
        .where(eq(blogArticle.id, id))
        .limit(1);
      return row;
    },

    async categoryById(id: string) {
      const [row] = await db
        .select()
        .from(blogCategory)
        .where(eq(blogCategory.id, id))
        .limit(1);
      return row;
    },

    async mediaById(id: string) {
      const [row] = await db
        .select()
        .from(blogMedia)
        .where(eq(blogMedia.id, id))
        .limit(1);
      return row;
    },

    async mediaByIds(ids: string[]) {
      if (ids.length === 0) return [];
      return db.select().from(blogMedia).where(inArray(blogMedia.id, ids));
    },

    async galleryForArticle(articleId: string) {
      return db
        .select({
          media: blogMedia,
          sortOrder: blogArticleGallery.sortOrder,
          altId: blogArticleGallery.altId,
          altEn: blogArticleGallery.altEn,
        })
        .from(blogArticleGallery)
        .innerJoin(blogMedia, eq(blogMedia.id, blogArticleGallery.mediaId))
        .where(eq(blogArticleGallery.articleId, articleId))
        .orderBy(
          asc(blogArticleGallery.sortOrder),
          asc(blogArticleGallery.mediaId),
        );
    },

    async versionsForArticle(articleId: string) {
      return db
        .select()
        .from(blogArticleVersion)
        .where(eq(blogArticleVersion.articleId, articleId));
    },

    async relatedIds(articleId: string) {
      const rows = await db
        .select({ id: blogArticleRelated.relatedArticleId })
        .from(blogArticleRelated)
        .where(eq(blogArticleRelated.articleId, articleId))
        .orderBy(asc(blogArticleRelated.sortOrder));
      return rows.map((row) => row.id);
    },

    async tutorsByIds(ids: string[]) {
      if (ids.length === 0) return [];
      return db
        .select({
          id: tutorProfile.id,
          name: user.name,
        })
        .from(tutorProfile)
        .innerJoin(user, eq(user.id, tutorProfile.userId))
        .where(inArray(tutorProfile.id, ids));
    },

    async listTutors() {
      return db
        .select({
          id: tutorProfile.id,
          name: user.name,
        })
        .from(tutorProfile)
        .innerJoin(user, eq(user.id, tutorProfile.userId))
        .orderBy(asc(user.name));
    },

    async createArticle(values: typeof blogArticle.$inferInsert) {
      const [row] = await db.insert(blogArticle).values(values).returning();
      if (!row) throw new Error("Blog article insert returned no row");
      return row;
    },

    async updateArticleIfVersion(
      id: string,
      expectedVersion: number,
      values: Partial<typeof blogArticle.$inferInsert>,
    ) {
      const [row] = await db
        .update(blogArticle)
        .set({
          ...values,
          version: sql`${blogArticle.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(blogArticle.id, id), eq(blogArticle.version, expectedVersion)),
        )
        .returning();
      return row;
    },

    async versionByArticleLocale(articleId: string, locale: string) {
      const [row] = await db
        .select()
        .from(blogArticleVersion)
        .where(
          and(
            eq(blogArticleVersion.articleId, articleId),
            eq(blogArticleVersion.locale, locale),
          ),
        )
        .limit(1);
      return row;
    },

    async versionById(id: string) {
      const [row] = await db
        .select()
        .from(blogArticleVersion)
        .where(eq(blogArticleVersion.id, id))
        .limit(1);
      return row;
    },

    async insertVersion(values: typeof blogArticleVersion.$inferInsert) {
      const [row] = await db
        .insert(blogArticleVersion)
        .values(values)
        .returning();
      if (!row) throw new Error("Blog version insert returned no row");
      return row;
    },

    async updateVersionIfVersion(
      id: string,
      expectedVersion: number,
      values: Partial<typeof blogArticleVersion.$inferInsert>,
    ) {
      const [row] = await db
        .update(blogArticleVersion)
        .set({
          ...values,
          version: sql`${blogArticleVersion.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(blogArticleVersion.id, id),
            eq(blogArticleVersion.version, expectedVersion),
          ),
        )
        .returning();
      return row;
    },

    async slugOwner(locale: string, slug: string) {
      const [row] = await db
        .select({
          articleId: blogArticleVersion.articleId,
          versionId: blogArticleVersion.id,
        })
        .from(blogArticleVersion)
        .where(
          and(
            eq(blogArticleVersion.locale, locale),
            eq(blogArticleVersion.slug, slug),
          ),
        )
        .limit(1);
      return row;
    },

    async archiveArticle(id: string) {
      return db.transaction(async (tx) => {
        const [article] = await tx
          .update(blogArticle)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(blogArticle.id, id))
          .returning();
        if (!article) return undefined;
        await tx
          .update(blogArticleVersion)
          .set({ status: "archived", updatedAt: new Date() })
          .where(eq(blogArticleVersion.articleId, id));
        return article;
      });
    },

    async replaceRelated(articleId: string, relatedArticleIds: string[]) {
      return db.transaction(async (tx) => {
        await tx
          .delete(blogArticleRelated)
          .where(eq(blogArticleRelated.articleId, articleId));
        if (relatedArticleIds.length > 0) {
          await tx.insert(blogArticleRelated).values(
            relatedArticleIds.map((relatedArticleId, sortOrder) => ({
              articleId,
              relatedArticleId,
              sortOrder,
            })),
          );
        }
      });
    },

    async replaceGallery(
      articleId: string,
      rows: Array<{
        mediaId: string;
        sortOrder: number;
        altId: string | null;
        altEn: string | null;
      }>,
    ) {
      return db.transaction(async (tx) => {
        await tx
          .delete(blogArticleGallery)
          .where(eq(blogArticleGallery.articleId, articleId));
        if (rows.length > 0) {
          await tx
            .insert(blogArticleGallery)
            .values(rows.map((row) => ({ articleId, ...row })));
        }
      });
    },

    async publishedCardsByIds(locale: string, articleIds: string[]) {
      if (articleIds.length === 0) return [];
      return db
        .select(publicCardSelection)
        .from(blogArticleVersion)
        .innerJoin(
          blogArticle,
          eq(blogArticle.id, blogArticleVersion.articleId),
        )
        .innerJoin(rootCategory, eq(rootCategory.id, blogArticle.categoryId))
        .leftJoin(subCategory, eq(subCategory.id, blogArticle.subcategoryId))
        .leftJoin(blogMedia, eq(blogMedia.id, blogArticle.heroMediaId))
        .leftJoin(
          tutorProfile,
          eq(tutorProfile.id, blogArticle.featuredTutorId),
        )
        .leftJoin(user, eq(user.id, tutorProfile.userId))
        .where(
          and(
            eq(blogArticleVersion.locale, locale),
            eq(blogArticleVersion.status, "published"),
            isNull(blogArticle.archivedAt),
            inArray(blogArticleVersion.articleId, articleIds),
          ),
        );
    },

    async relatedFallbackCards(input: {
      locale: string;
      articleId: string;
      categoryId: string;
      subcategoryId: string | null;
      excludeArticleIds: string[];
      limit: number;
    }) {
      const scope = input.subcategoryId
        ? eq(blogArticle.subcategoryId, input.subcategoryId)
        : eq(blogArticle.categoryId, input.categoryId);
      return db
        .select(publicCardSelection)
        .from(blogArticleVersion)
        .innerJoin(
          blogArticle,
          eq(blogArticle.id, blogArticleVersion.articleId),
        )
        .innerJoin(rootCategory, eq(rootCategory.id, blogArticle.categoryId))
        .leftJoin(subCategory, eq(subCategory.id, blogArticle.subcategoryId))
        .leftJoin(blogMedia, eq(blogMedia.id, blogArticle.heroMediaId))
        .leftJoin(
          tutorProfile,
          eq(tutorProfile.id, blogArticle.featuredTutorId),
        )
        .leftJoin(user, eq(user.id, tutorProfile.userId))
        .where(
          and(
            eq(blogArticleVersion.locale, input.locale),
            eq(blogArticleVersion.status, "published"),
            isNull(blogArticle.archivedAt),
            ne(blogArticleVersion.articleId, input.articleId),
            scope,
            input.excludeArticleIds.length > 0
              ? notInArray(
                  blogArticleVersion.articleId,
                  input.excludeArticleIds,
                )
              : undefined,
          ),
        )
        .orderBy(
          desc(blogArticleVersion.publishedAt),
          desc(blogArticleVersion.id),
        )
        .limit(input.limit);
    },

    async listPublished(input: {
      locale: string;
      limit: number;
      offset?: number;
      cursor: BlogCursor | null;
    }) {
      return db
        .select(publicCardSelection)
        .from(blogArticleVersion)
        .innerJoin(
          blogArticle,
          eq(blogArticle.id, blogArticleVersion.articleId),
        )
        .innerJoin(rootCategory, eq(rootCategory.id, blogArticle.categoryId))
        .leftJoin(subCategory, eq(subCategory.id, blogArticle.subcategoryId))
        .leftJoin(blogMedia, eq(blogMedia.id, blogArticle.heroMediaId))
        .leftJoin(
          tutorProfile,
          eq(tutorProfile.id, blogArticle.featuredTutorId),
        )
        .leftJoin(user, eq(user.id, tutorProfile.userId))
        .where(
          and(
            eq(blogArticleVersion.locale, input.locale),
            eq(blogArticleVersion.status, "published"),
            isNotNull(blogArticleVersion.publishedAt),
            isNull(blogArticle.archivedAt),
            afterPublishedCursor(input.cursor),
          ),
        )
        .orderBy(
          desc(blogArticleVersion.publishedAt),
          desc(blogArticleVersion.id),
        )
        .limit(input.limit + 1)
        .offset(input.offset ?? 0);
    },

    async getPublishedBySlug(input: { locale: string; slug: string }) {
      const [row] = await db
        .select({
          ...publicCardSelection,
          categoryId: blogArticle.categoryId,
          subcategoryId: blogArticle.subcategoryId,
          reviewedByTutorId: blogArticle.reviewedByTutorId,
          reviewedByName: blogArticle.reviewedByName,
          lead: blogArticleVersion.lead,
          seoTitle: blogArticleVersion.seoTitle,
          metaDescription: blogArticleVersion.metaDescription,
          keyFacts: blogArticleVersion.keyFacts,
          body: blogArticleVersion.body,
          faq: blogArticleVersion.faq,
        })
        .from(blogArticleVersion)
        .innerJoin(
          blogArticle,
          eq(blogArticle.id, blogArticleVersion.articleId),
        )
        .innerJoin(rootCategory, eq(rootCategory.id, blogArticle.categoryId))
        .leftJoin(subCategory, eq(subCategory.id, blogArticle.subcategoryId))
        .leftJoin(blogMedia, eq(blogMedia.id, blogArticle.heroMediaId))
        .leftJoin(
          tutorProfile,
          eq(tutorProfile.id, blogArticle.featuredTutorId),
        )
        .leftJoin(user, eq(user.id, tutorProfile.userId))
        .where(
          and(
            eq(blogArticleVersion.locale, input.locale),
            eq(blogArticleVersion.slug, input.slug),
            eq(blogArticleVersion.status, "published"),
            isNull(blogArticle.archivedAt),
          ),
        )
        .limit(1);
      return row;
    },

    async publishedAlternate(articleId: string, locale: string) {
      const [row] = await db
        .select({
          locale: blogArticleVersion.locale,
          slug: blogArticleVersion.slug,
        })
        .from(blogArticleVersion)
        .innerJoin(
          blogArticle,
          eq(blogArticle.id, blogArticleVersion.articleId),
        )
        .where(
          and(
            eq(blogArticleVersion.articleId, articleId),
            eq(blogArticleVersion.status, "published"),
            eq(blogArticleVersion.locale, locale),
            isNull(blogArticle.archivedAt),
          ),
        )
        .limit(1);
      return row;
    },

    async publishedGallery(articleId: string) {
      return db
        .select({
          storageKey: blogMedia.storageKey,
          width: blogMedia.width,
          height: blogMedia.height,
          altId: blogArticleGallery.altId,
          altEn: blogArticleGallery.altEn,
        })
        .from(blogArticleGallery)
        .innerJoin(blogMedia, eq(blogMedia.id, blogArticleGallery.mediaId))
        .where(eq(blogArticleGallery.articleId, articleId))
        .orderBy(asc(blogArticleGallery.sortOrder));
    },

    async listCategoriesAdmin() {
      return db
        .select()
        .from(blogCategory)
        .orderBy(asc(blogCategory.sortOrder), asc(blogCategory.createdAt));
    },

    async articleCountsByCategory() {
      return db
        .select({
          categoryId: blogArticle.categoryId,
          subcategoryId: blogArticle.subcategoryId,
        })
        .from(blogArticle);
    },

    async createCategory(values: typeof blogCategory.$inferInsert) {
      const [row] = await db.insert(blogCategory).values(values).returning();
      if (!row) throw new Error("Blog category insert returned no row");
      return row;
    },

    async updateCategoryIfVersion(
      id: string,
      expectedVersion: number,
      values: Partial<typeof blogCategory.$inferInsert>,
    ) {
      const [row] = await db
        .update(blogCategory)
        .set({
          ...values,
          version: sql`${blogCategory.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(blogCategory.id, id),
            eq(blogCategory.version, expectedVersion),
          ),
        )
        .returning();
      return row;
    },

    async reorderCategories(ids: string[]) {
      return db.transaction(async (tx) => {
        for (const [sortOrder, id] of ids.entries()) {
          await tx
            .update(blogCategory)
            .set({ sortOrder, updatedAt: new Date() })
            .where(eq(blogCategory.id, id));
        }
      });
    },

    async publishedCountForCategory(locale: string, categoryId: string) {
      const [row] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(blogArticleVersion)
        .innerJoin(
          blogArticle,
          eq(blogArticle.id, blogArticleVersion.articleId),
        )
        .where(
          and(
            eq(blogArticleVersion.locale, locale),
            eq(blogArticleVersion.status, "published"),
            eq(blogArticle.categoryId, categoryId),
            isNull(blogArticle.archivedAt),
          ),
        );
      return row?.count ?? 0;
    },

    async listCategoriesWithCounts(locale: string) {
      const rows = await db
        .select({
          id: blogCategory.id,
          parentId: blogCategory.parentId,
          slugId: blogCategory.slugId,
          slugEn: blogCategory.slugEn,
          titleId: blogCategory.titleId,
          titleEn: blogCategory.titleEn,
          introId: blogCategory.introId,
          introEn: blogCategory.introEn,
          sortOrder: blogCategory.sortOrder,
          count: sql<number>`count(${blogArticleVersion.id})::int`,
        })
        .from(blogCategory)
        .leftJoin(blogArticle, eq(blogArticle.categoryId, blogCategory.id))
        .leftJoin(
          blogArticleVersion,
          and(
            eq(blogArticleVersion.articleId, blogArticle.id),
            eq(blogArticleVersion.locale, locale),
            eq(blogArticleVersion.status, "published"),
          ),
        )
        .where(eq(blogCategory.isActive, true))
        .groupBy(blogCategory.id)
        .orderBy(asc(blogCategory.sortOrder), asc(blogCategory.id));
      return rows;
    },

    async sitemapRows() {
      return db
        .select({
          articleId: blogArticleVersion.articleId,
          locale: blogArticleVersion.locale,
          slug: blogArticleVersion.slug,
          updatedAt: blogArticleVersion.updatedAt,
        })
        .from(blogArticleVersion)
        .innerJoin(
          blogArticle,
          eq(blogArticle.id, blogArticleVersion.articleId),
        )
        .where(
          and(
            eq(blogArticleVersion.status, "published"),
            isNull(blogArticle.archivedAt),
          ),
        )
        .orderBy(desc(blogArticleVersion.updatedAt))
        .limit(5_000);
    },

    async insertMedia(values: typeof blogMedia.$inferInsert) {
      const [row] = await db.insert(blogMedia).values(values).returning();
      if (!row) throw new Error("Blog media insert returned no row");
      return row;
    },

    async mediaByStorageKey(storageKey: string) {
      const [row] = await db
        .select()
        .from(blogMedia)
        .where(eq(blogMedia.storageKey, storageKey))
        .limit(1);
      return row;
    },

    async hasPublishedArticleInCategory(categoryId: string) {
      const [row] = await db
        .select({ id: blogArticle.id })
        .from(blogArticle)
        .innerJoin(
          blogArticleVersion,
          eq(blogArticleVersion.articleId, blogArticle.id),
        )
        .where(
          and(
            eq(blogArticle.categoryId, categoryId),
            eq(blogArticleVersion.status, "published"),
          ),
        )
        .limit(1);
      return !!row;
    },

    async publishedArticleUsesCategory(categoryId: string) {
      const [row] = await db
        .select({ id: blogArticle.id })
        .from(blogArticle)
        .innerJoin(
          blogArticleVersion,
          eq(blogArticleVersion.articleId, blogArticle.id),
        )
        .where(
          and(
            or(
              eq(blogArticle.categoryId, categoryId),
              eq(blogArticle.subcategoryId, categoryId),
            ),
            eq(blogArticleVersion.status, "published"),
          ),
        )
        .limit(1);
      return !!row;
    },

    async categoryHasChildren(categoryId: string) {
      const rows = await db
        .select({ id: blogCategory.id })
        .from(blogCategory)
        .where(eq(blogCategory.parentId, categoryId))
        .limit(1);
      return rows.length > 0;
    },
    async categoryHasArticles(categoryId: string) {
      const rows = await db
        .select({ id: blogArticle.id })
        .from(blogArticle)
        .where(
          or(
            eq(blogArticle.categoryId, categoryId),
            eq(blogArticle.subcategoryId, categoryId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    async deleteCategoryIfVersion(categoryId: string, expectedVersion: number) {
      const rows = await db
        .delete(blogCategory)
        .where(
          and(
            eq(blogCategory.id, categoryId),
            eq(blogCategory.version, expectedVersion),
          ),
        )
        .returning({ id: blogCategory.id });
      return rows[0];
    },

    async categorySlugOwner(
      locale: "id" | "en",
      slug: string,
      excludeId?: string,
    ) {
      const column =
        locale === "id" ? blogCategory.slugId : blogCategory.slugEn;
      const [row] = await db
        .select({ id: blogCategory.id })
        .from(blogCategory)
        .where(
          excludeId
            ? and(eq(column, slug), sql`${blogCategory.id} <> ${excludeId}`)
            : eq(column, slug),
        )
        .limit(1);
      return row;
    },

    async transaction<T>(fn: (tx: TxClient) => Promise<T>) {
      return db.transaction(fn);
    },
  };
}

export type BlogRepo = ReturnType<typeof createBlogRepo>;
