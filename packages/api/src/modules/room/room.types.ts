import { z } from "zod";

export const listRoomsInput = z.void();

export const createRoomInput = z.object({
  name: z.string().min(1).max(255),
  location: z.string().min(1).max(255),
  capacity: z.number().int().min(1),
});

export const assignRoomInput = z.object({
  bookingId: z.string().min(1).max(100),
  roomId: z.string().min(1).max(100),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

export const checkAvailabilityInput = z.object({
  roomId: z.string().min(1).max(100),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

export type CreateRoomInput = z.infer<typeof createRoomInput>;
export type AssignRoomInput = z.infer<typeof assignRoomInput>;
export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInput>;
