import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
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
    try {
      return notificationService.list(context.session!.user.id, input ?? {});
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to list notifications", err);
    }
  }

  async function getUnreadCount({ context }: { context: Context }) {
    try {
      const count = await notificationService.getUnreadCount(
        context.session!.user.id,
      );
      return { count };
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to get unread count", err);
    }
  }

  async function markAsRead({
    context,
    input,
  }: {
    context: Context;
    input: IdInput;
  }) {
    try {
      await notificationService.markAsRead(context.session!.user.id, input.id);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to mark notification as read", err);
    }
  }

  async function markAllAsRead({ context }: { context: Context }) {
    try {
      await notificationService.markAllAsRead(context.session!.user.id);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError(
        "Failed to mark all notifications as read",
        err,
      );
    }
  }

  return { list, getUnreadCount, markAsRead, markAllAsRead };
}

export type NotificationHandler = ReturnType<typeof createNotificationHandler>;
