import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { internalServerError } from "../../lib/errors";
import type { RoomService } from "./room.service";

export type RoomHandler = ReturnType<typeof createRoomHandler>;

export function createRoomHandler(room: RoomService) {
  return {
    list: async ({ context: _context }: { context: Context }) => {
      try {
        return room.listActive();
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list rooms", err);
      }
    },

    create: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: { name: string; location: string; capacity: number };
    }) => {
      try {
        return room.createRoom(input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to create room", err);
      }
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
      try {
        return room.assignRoom(
          input.bookingId,
          input.roomId,
          new Date(input.startAt),
          new Date(input.endAt),
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to assign room", err);
      }
    },
  };
}
