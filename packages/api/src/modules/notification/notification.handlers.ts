import type { Context } from "../../context";
import type { z } from "zod";
import type { listInput, idInput } from "./notification.types";

type ListInput = z.infer<typeof listInput>;
type IdInput = z.infer<typeof idInput>;

export const notificationHandlers = {
  list: async ({ context, input }: { context: Context; input: ListInput }) => {
    return context.services.notification.list(
      context.session!.user.id,
      input ?? {},
    );
  },

  getUnreadCount: async ({ context }: { context: Context }) => {
    const c = await context.services.notification.getUnreadCount(
      context.session!.user.id,
    );
    return { count: c };
  },

  markAsRead: async ({
    context,
    input,
  }: {
    context: Context;
    input: IdInput;
  }) => {
    await context.services.notification.markAsRead(
      context.session!.user.id,
      input.id,
    );
    return { ok: true };
  },

  markAllAsRead: async ({ context }: { context: Context }) => {
    await context.services.notification.markAllAsRead(context.session!.user.id);
    return { ok: true };
  },
};
