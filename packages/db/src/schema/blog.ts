import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { uuidPrimaryKey, user } from "./auth";
import { tutorProfile } from "./tutor-profile";

export type BlogRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
};

export type BlogKeyFact = {
  text: string;
};

export type BlogFaqItem = {
  question: string;
  answer: string;
};

export type BlogBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; runs: BlogRun[] }
  | { type: "list"; style: "ordered" | "unordered"; items: BlogRun[][] }
  | { type: "quote"; runs: BlogRun[]; attribution?: string }
  | { type: "callout"; title: string; runs: BlogRun[] }
  | { type: "image"; mediaId: string; alt: string; caption?: string }
  | {
      type: "embed";
      provider: "instagram" | "tiktok";
      url: string;
      posterMediaId?: string;
    };

export const BLOG_LOCALES = ["id", "en"] as const;
export type BlogLocale = (typeof BLOG_LOCALES)[number];

export const BLOG_VERSION_STATUSES = [
  "draft",
  "in_review",
  "published",
  "archived",
] as const;
export type BlogVersionStatus = (typeof BLOG_VERSION_STATUSES)[number];

export const blogMedia = pgTable(
  "blog_media",
  {
    id: uuidPrimaryKey,
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    byteSize: integer("byte_size"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "blog_media_valid",
      sql`length(trim(${t.filename})) > 0
        AND ${t.contentType} IN ('image/png','image/jpeg','image/webp','image/gif')
        AND (${t.width} IS NULL OR (${t.width} > 0 AND ${t.width} <= 20000))
        AND (${t.height} IS NULL OR (${t.height} > 0 AND ${t.height} <= 20000))
        AND (${t.width} IS NULL OR ${t.height} IS NOT NULL)
        AND (${t.byteSize} IS NULL OR (${t.byteSize} > 0 AND ${t.byteSize} <= 5242880))`,
    ),
    index("blog_media_created_by_idx").on(t.createdBy),
  ],
);

export const blogCategory = pgTable(
  "blog_category",
  {
    id: uuidPrimaryKey,
    parentId: text("parent_id").references((): AnyPgColumn => blogCategory.id, {
      onDelete: "restrict",
    }),
    titleId: text("title_id").notNull(),
    titleEn: text("title_en").notNull(),
    slugId: text("slug_id").notNull(),
    slugEn: text("slug_en").notNull(),
    introId: text("intro_id"),
    introEn: text("intro_en"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("blog_category_slug_id_unique").on(t.slugId),
    uniqueIndex("blog_category_slug_en_unique").on(t.slugEn),
    check(
      "blog_category_valid",
      sql`length(trim(${t.titleId})) > 0
        AND length(trim(${t.titleEn})) > 0
        AND ${t.slugId} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND ${t.slugEn} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND ${t.version} > 0
        AND ${t.sortOrder} >= 0
        AND (${t.parentId} IS NULL OR ${t.parentId} <> ${t.id})`,
    ),
    index("blog_category_active_parent_sort_idx").on(
      t.isActive,
      t.parentId,
      t.sortOrder,
    ),
  ],
);

export const blogArticle = pgTable(
  "blog_article",
  {
    id: uuidPrimaryKey,
    categoryId: text("category_id").references(() => blogCategory.id, {
      onDelete: "restrict",
    }),
    subcategoryId: text("subcategory_id").references(() => blogCategory.id, {
      onDelete: "restrict",
    }),
    heroMediaId: text("hero_media_id").references(() => blogMedia.id, {
      onDelete: "restrict",
    }),
    featuredTutorId: text("featured_tutor_id").references(
      () => tutorProfile.id,
      { onDelete: "set null" },
    ),
    reviewedByTutorId: text("reviewed_by_tutor_id").references(
      () => tutorProfile.id,
      { onDelete: "set null" },
    ),
    featuredTutorName: text("featured_tutor_name"),
    reviewedByName: text("reviewed_by_name"),
    internalNotes: text("internal_notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("blog_article_valid", sql`${t.version} > 0`),
    index("blog_article_category_idx").on(t.categoryId, t.subcategoryId),
    index("blog_article_archived_idx").on(t.archivedAt),
  ],
);

export const blogArticleVersion = pgTable(
  "blog_article_version",
  {
    id: uuidPrimaryKey,
    articleId: text("article_id")
      .notNull()
      .references(() => blogArticle.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull().default(""),
    seoTitle: text("seo_title").notNull().default(""),
    metaDescription: text("meta_description").notNull().default(""),
    lead: text("lead").notNull().default(""),
    mainKeyword: text("main_keyword"),
    secondaryKeywords: jsonb("secondary_keywords").$type<string[] | null>(),
    keyFacts: jsonb("key_facts").$type<BlogKeyFact[]>().notNull().default([]),
    body: jsonb("body").$type<BlogBlock[]>().notNull().default([]),
    faq: jsonb("faq").$type<BlogFaqItem[]>().notNull().default([]),
    heroAlt: text("hero_alt"),
    readingMinutes: integer("reading_minutes").notNull().default(1),
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("blog_article_version_article_locale_unique").on(
      t.articleId,
      t.locale,
    ),
    uniqueIndex("blog_article_version_locale_slug_unique").on(t.locale, t.slug),
    check(
      "blog_article_version_valid",
      sql`${t.locale} IN ('id','en')
        AND ${t.status} IN ('draft','in_review','published','archived')
        AND ${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND ${t.version} > 0
        AND ${t.readingMinutes} > 0
        AND (${t.status} <> 'published' OR ${t.publishedAt} IS NOT NULL)`,
    ),
    index("blog_article_version_status_locale_published_idx").on(
      t.status,
      t.locale,
      t.publishedAt,
    ),
    index("blog_article_version_article_idx").on(t.articleId),
  ],
);

export const blogArticleRelated = pgTable(
  "blog_article_related",
  {
    articleId: text("article_id")
      .notNull()
      .references(() => blogArticle.id, { onDelete: "cascade" }),
    relatedArticleId: text("related_article_id")
      .notNull()
      .references(() => blogArticle.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.relatedArticleId] }),
    check(
      "blog_article_related_valid",
      sql`${t.articleId} <> ${t.relatedArticleId} AND ${t.sortOrder} >= 0`,
    ),
    index("blog_article_related_order_idx").on(t.articleId, t.sortOrder),
  ],
);

export const blogArticleGallery = pgTable(
  "blog_article_gallery",
  {
    articleId: text("article_id")
      .notNull()
      .references(() => blogArticle.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => blogMedia.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    altId: text("alt_id"),
    altEn: text("alt_en"),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.mediaId] }),
    check("blog_article_gallery_valid", sql`${t.sortOrder} >= 0`),
    index("blog_article_gallery_order_idx").on(t.articleId, t.sortOrder),
  ],
);
