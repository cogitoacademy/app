import type { Context } from "../../context";
import type { RoomService } from "./room.service";

export type RoomHandler = ReturnType<typeof createRoomHandler>;

export function createRoomHandler(room: RoomService) {
  return {
    list: async ({ context: _context }: { context: Context }) => {
      return room.listActive();
    },

    create: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: { name: string; location: string; capacity: number };
    }) => {
      return room.createRoom(input);
    },

    assign: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: {
        bookingId: string;
        roomId: string;
        startAt: string;
        endAt: string;
      };
    }) => {
      return room.assignRoom(
        input.bookingId,
        input.roomId,
        new Date(input.startAt),
        new Date(input.endAt),
      );
    },
  };
}
