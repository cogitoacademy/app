import type { Context } from "../../context";

export const roomHandlers = {
  list: async ({ context }: { context: Context }) => {
    return context.services.room.listActive();
  },

  create: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.room.createRoom(input);
  },

  assign: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.room.assignRoom(
      input.bookingId,
      input.roomId,
      new Date(input.startAt),
      new Date(input.endAt),
    );
  },
};
