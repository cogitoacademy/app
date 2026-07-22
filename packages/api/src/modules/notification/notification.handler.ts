import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { DomainError } from "../../lib/domain-errors";
import { internalServerError } from "../../lib/errors";
import type { listInput, idInput } from "./notification.types";
import type { NotificationService } from "./notification.service";

type ListInput = z.infer<typeof listInput>;
type IdInput = z.infer<typeof idInput>;

function mapNotificationError(err: DomainError) {
  return internalServerError(err.message, err);
}

export function createNotificationHandler(deps: {
  notificationService: NotificationService;
}) {
  const { notificationService } = deps;

  async function list({
    context,
    input,
  }: {
    context: Context;
    input: ListInput;
  }) {
    return withDomainMap(
      () => notificationService.list(context.session!.user.id, input ?? {}),
      mapNotificationError,
    );
  }

  async function getUnreadCount({ context }: { context: Context }) {
    return withDomainMap(async () => {
      const count = await notificationService.getUnreadCount(
        context.session!.user.id,
      );
      return { count };
    }, mapNotificationError);
  }

  async function markAsRead({
    context,
    input,
  }: {
    context: Context;
    input: IdInput;
  }) {
    return withDomainMap(
      () => notificationService.markAsRead(context.session!.user.id, input.id),
      mapNotificationError,
    );
  }

  async function markAllAsRead({ context }: { context: Context }) {
    return withDomainMap(
      () => notificationService.markAllAsRead(context.session!.user.id),
      mapNotificationError,
    );
  }

  return { list, getUnreadCount, markAsRead, markAllAsRead };
}

export type NotificationHandler = ReturnType<typeof createNotificationHandler>;
