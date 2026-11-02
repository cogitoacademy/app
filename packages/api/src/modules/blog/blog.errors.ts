import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import {
  badRequest,
  badRequestWithData,
  conflict,
  conflictWithData,
  internalServerError,
  notFound,
} from "../../lib/errors";

export class BlogNotFoundError extends DomainError {
  readonly domain = "blog";

  constructor(id: string) {
    super("BLOG_NOT_FOUND", "Blog article or resource not found", { id });
  }
}

export class BlogVersionNotFoundError extends DomainError {
  readonly domain = "blog";

  constructor(articleId: string, locale: string) {
    super("BLOG_VERSION_NOT_FOUND", "Blog language version not found", {
      articleId,
      locale,
    });
  }
}

export class BlogVersionConflictError extends DomainError {
  readonly domain = "blog";

  constructor(id: string, expectedVersion: number, actualVersion: number) {
    super(
      "VERSION_CONFLICT",
      "Blog content changed in another admin session. Reload and review it.",
      { id, expectedVersion, actualVersion },
    );
  }
}

export class BlogSlugImmutableError extends DomainError {
  readonly domain = "blog";

  constructor(slug: string) {
    super(
      "SLUG_IMMUTABLE",
      "A published blog slug cannot change. Create a new article instead.",
      { slug },
    );
  }
}

export class BlogSlugTakenError extends DomainError {
  readonly domain = "blog";

  constructor(slug: string, locale: string) {
    super("SLUG_TAKEN", "This slug is already used in this language.", {
      slug,
      locale,
    });
  }
}

export class BlogPublishInvalidError extends DomainError {
  readonly domain = "blog";

  constructor(missingFields: string[]) {
    super(
      "PUBLISH_INVALID",
      "Complete the required fields before publishing.",
      {
        missingFields,
      },
    );
  }
}

export class BlogCategoryInvalidError extends DomainError {
  readonly domain = "blog";

  constructor(message: string, details?: Record<string, unknown>) {
    super("BLOG_CATEGORY_INVALID", message, details);
  }
}

export class BlogCategoryInUseError extends DomainError {
  readonly domain = "blog";

  constructor(id: string) {
    super(
      "BLOG_CATEGORY_IN_USE",
      "This category still has published articles. Unpublish or move them first.",
      { id },
    );
  }
}

export class BlogMediaInvalidError extends DomainError {
  readonly domain = "blog";

  constructor(message: string, details?: Record<string, unknown>) {
    super("BLOG_MEDIA_INVALID", message, details);
  }
}

export class BlogArticleArchivedError extends DomainError {
  readonly domain = "blog";

  constructor(id: string) {
    super("BLOG_ARTICLE_ARCHIVED", "This blog article is archived.", { id });
  }
}

export function mapBlogError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof BlogNotFoundError) return notFound(err.message, err);
  if (err instanceof BlogVersionNotFoundError)
    return notFound(err.message, err);
  if (err instanceof BlogVersionConflictError)
    return conflictWithData(
      err.message,
      {
        actualVersion: err.details?.actualVersion,
        expectedVersion: err.details?.expectedVersion,
      },
      err,
    );
  if (err instanceof BlogSlugTakenError) return conflict(err.message, err);
  if (err instanceof BlogSlugImmutableError) return conflict(err.message, err);
  if (err instanceof BlogCategoryInUseError) return conflict(err.message, err);
  if (err instanceof BlogArticleArchivedError)
    return conflict(err.message, err);
  if (err instanceof BlogPublishInvalidError)
    return badRequestWithData(
      err.message,
      { missingFields: err.details?.missingFields ?? [] },
      err,
    );
  if (err instanceof BlogCategoryInvalidError)
    return badRequest(err.message, err);
  if (err instanceof BlogMediaInvalidError) return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
