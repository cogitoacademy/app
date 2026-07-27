import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  badRequest,
  conflict,
  internalServerError,
} from "../../lib/errors";

export class AchievementNotFoundError extends DomainError {
  readonly domain = "achievement";
  constructor(id: string) {
    super("ACHIEVEMENT_NOT_FOUND", "Achievement not found", { id });
  }
}

export class AchievementNotEditableError extends DomainError {
  readonly domain = "achievement";
  constructor(id: string) {
    super("ACHIEVEMENT_NOT_EDITABLE", "Achievement is not editable", { id });
  }
}

export class OptimisticLockError extends DomainError {
  readonly domain = "achievement";
  constructor(id: string, expectedVersion: number) {
    super("OPTIMISTIC_LOCK", "Resource was modified by another transaction", {
      id,
      expectedVersion,
    });
  }
}

export function mapAchievementError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof AchievementNotFoundError)
    return notFound(err.message, err);
  if (err instanceof AchievementNotEditableError)
    return badRequest(err.message, err);
  if (err instanceof OptimisticLockError) return conflict(err.message, err);
  return internalServerError(err.message, err);
}
