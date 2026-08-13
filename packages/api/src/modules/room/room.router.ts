import {
  listRoomsInput,
  createRoomInput,
  assignRoomInput,
  checkAvailabilityInput,
  relocateRoomInput,
  cancelRoomInput,
} from "./room.types";
import { adminProcedure, protectedProcedure } from "../../procedures";
import type { RoomHandler } from "./room.handler";

export function createRoomRouter(handler: RoomHandler) {
  return {
    list: protectedProcedure
      .route({
        method: "POST",
        path: "/rooms/list",
        tags: ["Rooms"],
        summary: "List active rooms",
        description: "Returns all active rooms for offline scheduling",
      })
      .input(listRoomsInput)
      .handler(handler.list),

    create: adminProcedure
      .route({
        method: "POST",
        path: "/admin/rooms/create",
        tags: ["Admin", "Rooms"],
        summary: "Create a room",
        description: "Adds a new physical room to the platform",
      })
      .input(createRoomInput)
      .handler(handler.create),

    assign: adminProcedure
      .route({
        method: "POST",
        path: "/admin/rooms/assign",
        tags: ["Admin", "Rooms"],
        summary: "Assign room to booking",
        description: "Confirms a room for an offline booking",
      })
      .input(assignRoomInput)
      .handler(handler.assign),

    checkAvailability: protectedProcedure
      .route({
        method: "POST",
        path: "/rooms/check-availability",
        tags: ["Rooms"],
        summary: "Check room availability",
        description: "Returns whether a room is free for a time slot",
      })
      .input(checkAvailabilityInput)
      .handler(handler.checkAvailability),

    relocate: adminProcedure
      .route({
        method: "POST",
        path: "/admin/rooms/relocate",
        tags: ["Admin", "Rooms"],
        summary: "Relocate booking to another room",
        description:
          "Moves a booking to a different room, freeing the previous one",
      })
      .input(relocateRoomInput)
      .handler(handler.relocate),

    cancelBooking: adminProcedure
      .route({
        method: "POST",
        path: "/admin/rooms/cancel-booking",
        tags: ["Admin", "Rooms"],
        summary: "Cancel room booking",
        description:
          "Cancels a booking's room assignment; the booking continues without a room",
      })
      .input(cancelRoomInput)
      .handler(handler.cancelBooking),
  };
}
