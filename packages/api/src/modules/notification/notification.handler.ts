import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapNotificationError } from "./notification.errors";
import type {
  listInput,
  idInput,
  updateReadStatusInput,
} from "./notification.types";
import type { NotificationService } from "./notification.service";

type ListInput = z.infer<typeof listInput>;
type IdInput = z.infer<typeof idInput>;
type UpdateReadStatusInput = z.infer<typeof updateReadStatusInput>;

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

  async function updateReadStatus({
    context,
    input,
  }: {
    context: Context;
    input: UpdateReadStatusInput;
  }) {
    return withDomainMap(async () => {
      await notificationService.updateReadStatus(
        context.session!.user.id,
        input.ids,
        input.isRead,
      );
      return { success: true as const };
    }, mapNotificationError);
  }

  async function markAllAsRead({ context }: { context: Context }) {
    return withDomainMap(
      () => notificationService.markAllAsRead(context.session!.user.id),
      mapNotificationError,
    );
  }

  return {
    list,
    getUnreadCount,
    markAsRead,
    updateReadStatus,
    markAllAsRead,
  };
}

export type NotificationHandler = ReturnType<typeof createNotificationHandler>;
