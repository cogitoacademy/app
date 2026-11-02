import type { z } from "zod";

import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapBlogError } from "./blog.errors";
import type { BlogService } from "./blog.service";
import {
  archiveBlogArticleInput,
  createBlogArticleInput,
  createBlogCategoryInput,
  deleteBlogCategoryInput,
  getAdminBlogArticleInput,
  getPublicBlogArticleInput,
  listAdminBlogArticlesInput,
  listPublicBlogArticlesInput,
  listPublicBlogCategoriesInput,
  publicBlogSitemapInput,
  publishBlogVersionInput,
  registerBlogMediaInput,
  reorderBlogCategoriesInput,
  replaceBlogGalleryInput,
  replaceRelatedBlogArticlesInput,
  saveBlogVersionInput,
  unpublishBlogVersionInput,
  updateBlogArticleInput,
  updateBlogCategoryInput,
} from "./blog.types";

export function createBlogHandler(service: BlogService) {
  function actor(context: Context) {
    const id = context.session?.user?.id;
    if (!id) throw new Error("Admin blog handler requires a session user");
    return id;
  }

  return {
    listCategories: () =>
      withDomainMap(() => service.listCategoriesAdmin(), mapBlogError),
    listTutors: () =>
      withDomainMap(() => service.listTutorOptions(), mapBlogError),
    createCategory: ({
      input,
    }: {
      input: z.infer<typeof createBlogCategoryInput>;
    }) => withDomainMap(() => service.createCategory(input), mapBlogError),
    updateCategory: ({
      input,
    }: {
      input: z.infer<typeof updateBlogCategoryInput>;
    }) => withDomainMap(() => service.updateCategory(input), mapBlogError),
    deleteCategory: ({
      input,
    }: {
      input: z.infer<typeof deleteBlogCategoryInput>;
    }) => withDomainMap(() => service.deleteCategory(input), mapBlogError),
    reorderCategories: ({
      input,
    }: {
      input: z.infer<typeof reorderBlogCategoriesInput>;
    }) =>
      withDomainMap(() => service.reorderCategories(input.ids), mapBlogError),
    list: ({ input }: { input: z.infer<typeof listAdminBlogArticlesInput> }) =>
      withDomainMap(() => service.listAdmin(input), mapBlogError),
    get: ({ input }: { input: z.infer<typeof getAdminBlogArticleInput> }) =>
      withDomainMap(() => service.getAdmin(input.articleId), mapBlogError),
    createArticle: ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof createBlogArticleInput>;
    }) =>
      withDomainMap(
        () => service.createArticle(input, actor(context)),
        mapBlogError,
      ),
    updateArticle: ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof updateBlogArticleInput>;
    }) =>
      withDomainMap(
        () => service.updateArticle(input, actor(context)),
        mapBlogError,
      ),
    saveVersion: ({ input }: { input: z.infer<typeof saveBlogVersionInput> }) =>
      withDomainMap(() => service.saveVersion(input), mapBlogError),
    publishVersion: ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof publishBlogVersionInput>;
    }) =>
      withDomainMap(
        () => service.publishVersion(input, actor(context)),
        mapBlogError,
      ),
    unpublishVersion: ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof unpublishBlogVersionInput>;
    }) =>
      withDomainMap(
        () => service.unpublishVersion(input, actor(context)),
        mapBlogError,
      ),
    archiveArticle: ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof archiveBlogArticleInput>;
    }) =>
      withDomainMap(
        () => service.archiveArticle(input, actor(context)),
        mapBlogError,
      ),
    replaceRelated: ({
      input,
    }: {
      input: z.infer<typeof replaceRelatedBlogArticlesInput>;
    }) => withDomainMap(() => service.replaceRelated(input), mapBlogError),
    replaceGallery: ({
      input,
    }: {
      input: z.infer<typeof replaceBlogGalleryInput>;
    }) =>
      withDomainMap(
        () =>
          service.replaceGallery({
            articleId: input.articleId,
            expectedVersion: input.expectedVersion,
            images: input.images.map((image) => ({
              mediaId: image.mediaId,
              altId: image.altId ?? null,
              altEn: image.altEn ?? null,
            })),
          }),
        mapBlogError,
      ),
    registerMedia: ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof registerBlogMediaInput>;
    }) =>
      withDomainMap(
        () => service.registerMedia(input, actor(context)),
        mapBlogError,
      ),
    listPublic: ({
      input,
    }: {
      input: z.infer<typeof listPublicBlogArticlesInput>;
    }) => withDomainMap(() => service.listPublic(input), mapBlogError),
    getPublic: ({
      input,
    }: {
      input: z.infer<typeof getPublicBlogArticleInput>;
    }) => withDomainMap(() => service.getPublic(input), mapBlogError),
    listPublicCategories: ({
      input,
    }: {
      input: z.infer<typeof listPublicBlogCategoriesInput>;
    }) =>
      withDomainMap(
        () => service.listPublicCategories(input.locale),
        mapBlogError,
      ),
    sitemap: ({
      input: _input,
    }: {
      input: z.infer<typeof publicBlogSitemapInput>;
    }) => withDomainMap(() => service.sitemap(), mapBlogError),
  };
}

export type BlogHandler = ReturnType<typeof createBlogHandler>;
