import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapRoomError } from "./room.errors";
import type { RoomService } from "./room.service";
import type {
  CreateRoomInput,
  AssignRoomInput,
  CheckAvailabilityInput,
  RelocateRoomInput,
  CancelRoomInput,
} from "./room.types";

export type RoomHandler = ReturnType<typeof createRoomHandler>;

export function createRoomHandler(room: RoomService) {
  return {
    list: async ({ context: _context }: { context: Context }) => {
      return withDomainMap(() => room.listActive(), mapRoomError);
    },

    create: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: CreateRoomInput;
    }) => {
      return withDomainMap(() => room.createRoom(input), mapRoomError);
    },

    assign: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: AssignRoomInput;
    }) => {
      return withDomainMap(
        () =>
          room.assignRoom(
            input.bookingId,
            input.roomId,
            input.startAt,
            input.endAt,
          ),
        mapRoomError,
      );
    },

    checkAvailability: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: CheckAvailabilityInput;
    }) => {
      return withDomainMap(
        async () => ({
          available: await room.checkAvailability(
            input.roomId,
            input.startAt,
            input.endAt,
          ),
        }),
        mapRoomError,
      );
    },

    relocate: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: RelocateRoomInput;
    }) => {
      return withDomainMap(
        () =>
          room.relocateRoom(
            input.bookingId,
            input.roomId,
            input.startAt,
            input.endAt,
          ),
        mapRoomError,
      );
    },

    cancelBooking: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: CancelRoomInput;
    }) => {
      return withDomainMap(
        () => room.cancelRoomBooking(input.bookingId),
        mapRoomError,
      );
    },
  };
}
