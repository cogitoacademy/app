import { z } from "zod";

import {
  BLOG_LOCALES,
  BLOG_VERSION_STATUSES,
  type BlogBlock,
  type BlogFaqItem,
  type BlogKeyFact,
  type BlogLocale,
  type BlogRun,
  type BlogVersionStatus,
} from "@cogito-app/db/schema/blog";

export type {
  BlogBlock,
  BlogFaqItem,
  BlogKeyFact,
  BlogLocale,
  BlogRun,
  BlogVersionStatus,
};

export const BLOG_BODY_MAX_BLOCKS = 60;
export const BLOG_RELATED_MAX = 3;
export const BLOG_PUBLIC_PAGE_SIZE = 12;
export const BLOG_PUBLIC_PAGE_SIZE_MAX = 24;
export const BLOG_SITEMAP_MAX = 5_000;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use lowercase letters, digits, and hyphens",
  );

const idSchema = z.string().trim().min(1).max(100);
const optionalIdSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  idSchema.nullable().optional(),
);
const nullableText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().max(max).nullable().optional(),
  );

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isInstagramUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (
      url.hostname !== "instagram.com" &&
      url.hostname !== "www.instagram.com"
    ) {
      return false;
    }
    return /^\/(reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function isTikTokUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname !== "tiktok.com" && url.hostname !== "www.tiktok.com") {
      return false;
    }
    return /^\/@[A-Za-z0-9._-]+\/video\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeEmbedUrl(
  provider: "instagram" | "tiktok",
  value: string,
) {
  const url = new URL(value);
  const path = url.pathname.replace(/\/+$/, "");
  return `https://www.${provider === "instagram" ? "instagram.com" : "tiktok.com"}${path}`;
}

export const blogRunSchema = z
  .object({
    text: z.string().trim().min(1).max(5_000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    href: z
      .string()
      .trim()
      .max(2_048)
      .refine(isHttpUrl, "Links must use http or https")
      .optional(),
  })
  .strict();

export const blogBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("heading"),
      level: z.union([z.literal(2), z.literal(3)]),
      text: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      type: z.literal("paragraph"),
      runs: z.array(blogRunSchema).min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("list"),
      style: z.enum(["ordered", "unordered"]),
      items: z.array(z.array(blogRunSchema).min(1).max(100)).min(1).max(50),
    })
    .strict(),
  z
    .object({
      type: z.literal("quote"),
      runs: z.array(blogRunSchema).min(1).max(200),
      attribution: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("callout"),
      title: z.string().trim().min(1).max(300),
      runs: z.array(blogRunSchema).min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("image"),
      mediaId: idSchema,
      alt: z.string().trim().min(1).max(500),
      caption: z.string().trim().max(500).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("embed"),
      provider: z.enum(["instagram", "tiktok"]),
      url: z.string().trim().min(1).max(2_048),
      posterMediaId: idSchema.optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      const valid =
        value.provider === "instagram"
          ? isInstagramUrl(value.url)
          : isTikTokUrl(value.url);
      if (!valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message:
            value.provider === "instagram"
              ? "Use a public Instagram reel, post, or TV URL"
              : "Use a TikTok video URL in the form /@user/video/<id>",
        });
      }
    }),
]);

export const blogBodySchema = z
  .array(blogBlockSchema)
  .max(BLOG_BODY_MAX_BLOCKS);

export const blogKeyFactsSchema = z
  .array(z.object({ text: z.string().trim().min(1).max(500) }).strict())
  .max(10);

export const blogFaqSchema = z
  .array(
    z
      .object({
        question: z.string().trim().min(1).max(300),
        answer: z.string().trim().min(1).max(5_000),
      })
      .strict(),
  )
  .max(20);

export const blogVersionFieldsSchema = z
  .object({
    slug: slugSchema,
    title: z.string().trim().max(200).default(""),
    seoTitle: z.string().trim().max(60).default(""),
    metaDescription: z.string().trim().max(155).default(""),
    lead: z.string().trim().max(1_000).default(""),
    mainKeyword: nullableText(200),
    secondaryKeywords: z
      .array(z.string().trim().min(1).max(100))
      .max(20)
      .nullable()
      .optional(),
    keyFacts: blogKeyFactsSchema.default([]),
    body: blogBodySchema.default([]),
    faq: blogFaqSchema.default([]),
    heroAlt: nullableText(500),
  })
  .strict();

export const listAdminBlogArticlesInput = z
  .object({
    status: z.enum(BLOG_VERSION_STATUSES).optional(),
    locale: z.enum(BLOG_LOCALES).optional(),
    cursor: z.string().trim().max(300).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export const getAdminBlogArticleInput = z
  .object({ articleId: idSchema })
  .strict();

export const createBlogArticleInput = z
  .object({
    categoryId: idSchema,
    subcategoryId: optionalIdSchema,
    heroMediaId: optionalIdSchema,
    featuredTutorId: optionalIdSchema,
    reviewedByTutorId: optionalIdSchema,
    internalNotes: nullableText(5_000),
  })
  .strict();

export const updateBlogArticleInput = z
  .object({
    articleId: idSchema,
    expectedVersion: z.number().int().positive(),
    categoryId: idSchema.optional(),
    subcategoryId: optionalIdSchema,
    heroMediaId: optionalIdSchema,
    featuredTutorId: optionalIdSchema,
    reviewedByTutorId: optionalIdSchema,
    internalNotes: nullableText(5_000),
  })
  .strict();

export const saveBlogVersionInput = blogVersionFieldsSchema
  .extend({
    articleId: idSchema,
    locale: z.enum(BLOG_LOCALES),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

export const publishBlogVersionInput = z
  .object({
    articleId: idSchema,
    locale: z.enum(BLOG_LOCALES),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const unpublishBlogVersionInput = publishBlogVersionInput;

export const archiveBlogArticleInput = z
  .object({
    articleId: idSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const replaceRelatedBlogArticlesInput = z
  .object({
    articleId: idSchema,
    expectedVersion: z.number().int().positive(),
    relatedArticleIds: z
      .array(idSchema)
      .max(BLOG_RELATED_MAX)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate related article",
      ),
  })
  .strict();

export const replaceBlogGalleryInput = z
  .object({
    articleId: idSchema,
    expectedVersion: z.number().int().positive(),
    images: z
      .array(
        z
          .object({
            mediaId: idSchema,
            altId: nullableText(500),
            altEn: nullableText(500),
          })
          .strict(),
      )
      .max(20)
      .refine(
        (images) =>
          new Set(images.map((image) => image.mediaId)).size === images.length,
        "Duplicate gallery image",
      ),
  })
  .strict();

export const registerBlogMediaInput = z
  .object({
    storageKey: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine(
        (value) => !value.includes("..") && !value.startsWith("/"),
        "Invalid storage key",
      ),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine(
        (value) => !value.includes("..") && !value.startsWith("/"),
        "Invalid filename",
      ),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    width: z.number().int().positive().max(20_000).optional(),
    height: z.number().int().positive().max(20_000).optional(),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.width === undefined) !== (value.height === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "Send both width and height, or neither",
      });
    }
  });

const categoryFields = z
  .object({
    parentId: optionalIdSchema,
    titleId: z.string().trim().min(1).max(200),
    titleEn: z.string().trim().min(1).max(200),
    slugId: slugSchema,
    slugEn: slugSchema,
    introId: nullableText(1_000),
    introEn: nullableText(1_000),
    isActive: z.boolean().default(true),
  })
  .strict();

export const createBlogCategoryInput = categoryFields;
export const updateBlogCategoryInput = categoryFields
  .extend({
    categoryId: idSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const reorderBlogCategoriesInput = z
  .object({
    ids: z
      .array(idSchema)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export const listPublicBlogArticlesInput = z
  .object({
    locale: z.enum(BLOG_LOCALES),
    cursor: z.string().trim().max(300).optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(BLOG_PUBLIC_PAGE_SIZE_MAX)
      .default(BLOG_PUBLIC_PAGE_SIZE),
  })
  .strict();

export const getPublicBlogArticleInput = z
  .object({ locale: z.enum(BLOG_LOCALES), slug: slugSchema })
  .strict();

export const listPublicBlogCategoriesInput = z
  .object({ locale: z.enum(BLOG_LOCALES) })
  .strict();

export const publicBlogSitemapInput = z.object({}).strict();

export type ListAdminBlogArticlesInput = z.infer<
  typeof listAdminBlogArticlesInput
>;
export type GetAdminBlogArticleInput = z.infer<typeof getAdminBlogArticleInput>;
export type CreateBlogArticleInput = z.infer<typeof createBlogArticleInput>;
export type UpdateBlogArticleInput = z.infer<typeof updateBlogArticleInput>;
export type SaveBlogVersionInput = z.infer<typeof saveBlogVersionInput>;
export type PublishBlogVersionInput = z.infer<typeof publishBlogVersionInput>;
export type UnpublishBlogVersionInput = z.infer<
  typeof unpublishBlogVersionInput
>;
export type ArchiveBlogArticleInput = z.infer<typeof archiveBlogArticleInput>;
export type ReplaceRelatedBlogArticlesInput = z.infer<
  typeof replaceRelatedBlogArticlesInput
>;
export type ReplaceBlogGalleryInput = z.infer<typeof replaceBlogGalleryInput>;
export type RegisterBlogMediaInput = z.infer<typeof registerBlogMediaInput>;
export type CreateBlogCategoryInput = z.infer<typeof createBlogCategoryInput>;
export type UpdateBlogCategoryInput = z.infer<typeof updateBlogCategoryInput>;
export type ListPublicBlogArticlesInput = z.infer<
  typeof listPublicBlogArticlesInput
>;
export type GetPublicBlogArticleInput = z.infer<
  typeof getPublicBlogArticleInput
>;
export type ListPublicBlogCategoriesInput = z.infer<
  typeof listPublicBlogCategoriesInput
>;

export type BlogMediaDto = {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  width: number | null;
  height: number | null;
  byteSize: number | null;
};

export type BlogCategoryRefDto = {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
};

export type AdminBlogCategoryDto = {
  id: string;
  parentId: string | null;
  titleId: string;
  titleEn: string;
  slugId: string;
  slugEn: string;
  introId: string | null;
  introEn: string | null;
  isActive: boolean;
  version: number;
  articleCount: number;
};

export type AdminBlogVersionDto = {
  id: string;
  articleId: string;
  locale: BlogLocale;
  slug: string;
  title: string;
  seoTitle: string;
  metaDescription: string;
  lead: string;
  mainKeyword: string | null;
  secondaryKeywords: string[] | null;
  keyFacts: BlogKeyFact[];
  body: BlogBlock[];
  faq: BlogFaqItem[];
  heroAlt: string | null;
  readingMinutes: number;
  status: BlogVersionStatus;
  publishedAt: string | null;
  version: number;
  updatedAt: string;
};

export type BlogTutorRefDto = {
  id: string;
  name: string;
};

export type AdminBlogArticleDto = {
  id: string;
  category: BlogCategoryRefDto;
  subcategory: BlogCategoryRefDto | null;
  heroMedia: BlogMediaDto | null;
  gallery: Array<
    BlogMediaDto & {
      sortOrder: number;
      altId: string | null;
      altEn: string | null;
    }
  >;
  featuredTutor: BlogTutorRefDto | null;
  reviewedByTutor: BlogTutorRefDto | null;
  relatedArticleIds: string[];
  internalNotes: string | null;
  archivedAt: string | null;
  version: number;
  versions: { id: AdminBlogVersionDto | null; en: AdminBlogVersionDto | null };
  createdAt: string;
  updatedAt: string;
};

export type AdminBlogListRowDto = {
  id: string;
  categoryId: string;
  categoryTitle: string;
  titleId: string | null;
  titleEn: string | null;
  statusId: BlogVersionStatus | null;
  statusEn: BlogVersionStatus | null;
  updatedAt: string;
  archivedAt: string | null;
};

export type PublicBlogCardDto = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  hero: {
    url: string;
    width: number | null;
    height: number | null;
    alt: string | null;
  } | null;
  category: { slug: string; title: string };
  subcategory: { slug: string; title: string } | null;
  tutorName: string | null;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
};

export type PublicBlogArticleDto = PublicBlogCardDto & {
  lead: string;
  seoTitle: string;
  metaDescription: string;
  keyFacts: BlogKeyFact[];
  body: BlogBlock[];
  faq: BlogFaqItem[];
  gallery: Array<{
    url: string;
    width: number | null;
    height: number | null;
    alt: string | null;
  }>;
  media: Record<string, BlogMediaDto>;
  related: PublicBlogCardDto[];
  alternate: { locale: BlogLocale; slug: string } | null;
};

export type PublicBlogCategoryDto = {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  intro: string | null;
  articleCount: number;
};

export type PublicBlogSitemapEntry = {
  articleId: string;
  locale: BlogLocale;
  slug: string;
  updatedAt: string;
  alternate: { locale: BlogLocale; slug: string } | null;
};
