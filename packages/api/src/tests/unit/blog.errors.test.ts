import { describe, expect, test } from "bun:test";

import { DomainError } from "../../lib/domain-errors";
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
  mapBlogError,
} from "../../modules/blog/blog.errors";

describe("blog errors", () => {
  test("exposes domain codes and details", () => {
    expect(new BlogNotFoundError("id").code).toBe("BLOG_NOT_FOUND");
    expect(new BlogVersionNotFoundError("a", "id").code).toBe(
      "BLOG_VERSION_NOT_FOUND",
    );
    expect(new BlogVersionConflictError("id", 1, 2).code).toBe(
      "VERSION_CONFLICT",
    );
    expect(new BlogSlugImmutableError("slug").code).toBe("SLUG_IMMUTABLE");
    expect(new BlogSlugTakenError("slug", "id").details).toEqual({
      slug: "slug",
      locale: "id",
    });
    expect(new BlogPublishInvalidError(["title"]).details).toEqual({
      missingFields: ["title"],
    });
    expect(new BlogCategoryInvalidError("bad", { x: 1 }).details).toEqual({
      x: 1,
    });
    expect(new BlogCategoryInUseError("cat").code).toBe("BLOG_CATEGORY_IN_USE");
    expect(new BlogMediaInvalidError("bad").code).toBe("BLOG_MEDIA_INVALID");
    expect(new BlogArticleArchivedError("a").code).toBe(
      "BLOG_ARTICLE_ARCHIVED",
    );
  });

  test("maps every domain error to an RPC code", () => {
    expect(mapBlogError(new BlogNotFoundError("id")).code).toBe("NOT_FOUND");
    expect(mapBlogError(new BlogVersionNotFoundError("a", "id")).code).toBe(
      "NOT_FOUND",
    );
    expect(mapBlogError(new BlogVersionConflictError("id", 1, 2)).code).toBe(
      "CONFLICT",
    );
    expect(mapBlogError(new BlogSlugTakenError("slug", "id")).code).toBe(
      "CONFLICT",
    );
    expect(mapBlogError(new BlogSlugImmutableError("slug")).code).toBe(
      "CONFLICT",
    );
    expect(mapBlogError(new BlogCategoryInUseError("cat")).code).toBe(
      "CONFLICT",
    );
    expect(mapBlogError(new BlogArticleArchivedError("a")).code).toBe(
      "CONFLICT",
    );
    const publishError = mapBlogError(
      new BlogPublishInvalidError(["title", "heroAlt"]),
    );
    expect(publishError.code).toBe("BAD_REQUEST");
    expect(publishError.data).toEqual({
      missingFields: ["title", "heroAlt"],
    });

    const conflictError = mapBlogError(
      new BlogVersionConflictError("id", 1, 2),
    );
    expect(conflictError.data).toEqual({
      actualVersion: 2,
      expectedVersion: 1,
    });
    expect(mapBlogError(new BlogCategoryInvalidError("bad")).code).toBe(
      "BAD_REQUEST",
    );
    expect(mapBlogError(new BlogMediaInvalidError("bad")).code).toBe(
      "BAD_REQUEST",
    );
    expect(
      mapBlogError(
        new (class extends DomainError {
          readonly domain = "test";
        })("PLAIN", "plain"),
      ).code,
    ).toBe("INTERNAL_SERVER_ERROR");
  });
});
