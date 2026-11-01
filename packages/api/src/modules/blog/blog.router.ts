import { adminProcedure, publicProcedure } from "../../procedures";
import type { BlogHandler } from "./blog.handler";
import {
  archiveBlogArticleInput,
  createBlogArticleInput,
  createBlogCategoryInput,
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

export function createBlogRouter(handler: BlogHandler) {
  return {
    adminBlog: {
      tutors: adminProcedure.handler(handler.listTutors),
      categories: {
        list: adminProcedure.handler(handler.listCategories),
        create: adminProcedure
          .input(createBlogCategoryInput)
          .handler(handler.createCategory),
        update: adminProcedure
          .input(updateBlogCategoryInput)
          .handler(handler.updateCategory),
        reorder: adminProcedure
          .input(reorderBlogCategoriesInput)
          .handler(handler.reorderCategories),
      },
      list: adminProcedure
        .input(listAdminBlogArticlesInput)
        .handler(handler.list),
      get: adminProcedure.input(getAdminBlogArticleInput).handler(handler.get),
      createArticle: adminProcedure
        .input(createBlogArticleInput)
        .handler(handler.createArticle),
      updateArticle: adminProcedure
        .input(updateBlogArticleInput)
        .handler(handler.updateArticle),
      saveVersion: adminProcedure
        .input(saveBlogVersionInput)
        .handler(handler.saveVersion),
      publishVersion: adminProcedure
        .input(publishBlogVersionInput)
        .handler(handler.publishVersion),
      unpublishVersion: adminProcedure
        .input(unpublishBlogVersionInput)
        .handler(handler.unpublishVersion),
      archiveArticle: adminProcedure
        .input(archiveBlogArticleInput)
        .handler(handler.archiveArticle),
      replaceRelated: adminProcedure
        .input(replaceRelatedBlogArticlesInput)
        .handler(handler.replaceRelated),
      replaceGallery: adminProcedure
        .input(replaceBlogGalleryInput)
        .handler(handler.replaceGallery),
      registerMedia: adminProcedure
        .input(registerBlogMediaInput)
        .handler(handler.registerMedia),
    },
    publicContent: {
      blog: {
        list: publicProcedure
          .route({
            method: "POST",
            path: "/public-content/blog/list",
            tags: ["Public content", "Blog"],
            summary: "List published blog articles",
          })
          .input(listPublicBlogArticlesInput)
          .handler(handler.listPublic),
        get: publicProcedure
          .route({
            method: "POST",
            path: "/public-content/blog/get",
            tags: ["Public content", "Blog"],
            summary: "Get one published blog article",
          })
          .input(getPublicBlogArticleInput)
          .handler(handler.getPublic),
        categories: publicProcedure
          .route({
            method: "POST",
            path: "/public-content/blog/categories",
            tags: ["Public content", "Blog"],
            summary: "List active blog categories",
          })
          .input(listPublicBlogCategoriesInput)
          .handler(handler.listPublicCategories),
        sitemap: publicProcedure
          .route({
            method: "POST",
            path: "/public-content/blog/sitemap",
            tags: ["Public content", "Blog"],
            summary: "List published blog URLs for the sitemap",
          })
          .input(publicBlogSitemapInput)
          .handler(handler.sitemap),
      },
    },
  };
}
