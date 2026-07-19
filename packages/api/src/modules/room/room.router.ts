import { z } from "zod";

import { adminProcedure, protectedProcedure } from "../../procedures";
import { roomHandlers } from "./room.handlers";

export const roomRouter = {
  list: protectedProcedure
    .route({
      method: "POST",
      path: "/rooms/list",
      tags: ["Rooms"],
      summary: "List active rooms",
      description: "Returns all active rooms for offline scheduling",
    })
    .input(z.void())
    .handler(roomHandlers.list),

  create: adminProcedure
    .route({
      method: "POST",
      path: "/admin/rooms/create",
      tags: ["Admin", "Rooms"],
      summary: "Create a room",
      description: "Adds a new physical room to the platform",
    })
    .input(
      z.object({
        name: z.string().min(1),
        location: z.string().min(1),
        capacity: z.number().int().min(1),
      }),
    )
    .handler(roomHandlers.create),

  assign: adminProcedure
    .route({
      method: "POST",
      path: "/admin/rooms/assign",
      tags: ["Admin", "Rooms"],
      summary: "Assign room to booking",
      description: "Confirms a room for an offline booking",
    })
    .input(
      z.object({
        bookingId: z.string(),
        roomId: z.string(),
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
      }),
    )
    .handler(roomHandlers.assign),
};
