import { z } from "zod";

export const listRoomsInput = z.void();

export const createRoomInput = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  capacity: z.number().int().min(1),
});

export const assignRoomInput = z.object({
  bookingId: z.string().min(1),
  roomId: z.string().min(1),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

export type CreateRoomInput = z.infer<typeof createRoomInput>;
export type AssignRoomInput = z.infer<typeof assignRoomInput>;
