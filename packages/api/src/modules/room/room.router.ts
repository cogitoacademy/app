import { listRoomsInput, createRoomInput, assignRoomInput } from "./room.types";
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
  };
}
