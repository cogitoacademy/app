import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, internalServerError } from "../../lib/errors";

export class NotificationNotFoundError extends DomainError {
  readonly domain = "notification";
  constructor(notificationId: string) {
    super("NOTIFICATION_NOT_FOUND", "Notification not found", {
      notificationId,
    });
  }
}

export function mapNotificationError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof NotificationNotFoundError)
    return notFound(err.message, err);
  return internalServerError(err.message, err);
}
