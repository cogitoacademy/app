import type { Context } from "../../context";
import type { z } from "zod";
import type { listInput, idInput } from "./notification.types";
import type { NotificationService } from "./notification.service";

type ListInput = z.infer<typeof listInput>;
type IdInput = z.infer<typeof idInput>;

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
    return notificationService.list(context.session!.user.id, input ?? {});
  }

  async function getUnreadCount({ context }: { context: Context }) {
    const count = await notificationService.getUnreadCount(
      context.session!.user.id,
    );
    return { count };
  }

  async function markAsRead({
    context,
    input,
  }: {
    context: Context;
    input: IdInput;
  }) {
    await notificationService.markAsRead(context.session!.user.id, input.id);
    return { ok: true };
  }

  async function markAllAsRead({ context }: { context: Context }) {
    await notificationService.markAllAsRead(context.session!.user.id);
    return { ok: true };
  }

  return { list, getUnreadCount, markAsRead, markAllAsRead };
}

export type NotificationHandler = ReturnType<typeof createNotificationHandler>;
