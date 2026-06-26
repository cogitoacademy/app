import { z } from "zod";

import { adminProcedure, protectedProcedure } from "../../procedures";

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
    .handler(async ({ context }) => {
      return context.services.room.listActive();
    }),

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
    .handler(async ({ context, input }) => {
      return context.services.room.createRoom(input);
    }),

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
    .handler(async ({ context, input }) => {
      return context.services.room.assignRoom(
        input.bookingId,
        input.roomId,
        new Date(input.startAt),
        new Date(input.endAt),
      );
    }),
};
