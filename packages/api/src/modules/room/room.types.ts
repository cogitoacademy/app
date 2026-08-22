import { z } from "zod";

const dateRangeFields = {
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
};

const endAfterStart = (d: { startAt: Date; endAt: Date }) =>
  d.endAt.getTime() > d.startAt.getTime();

export const listRoomsInput = z.void();

export const listPendingRoomApprovalsInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export const createRoomInput = z.object({
  name: z.string().min(1).max(255),
  location: z.string().min(1).max(255),
  capacity: z.number().int().min(1),
});

export const assignRoomInput = z
  .object({
    bookingId: z.string().min(1).max(100),
    roomId: z.string().min(1).max(100),
    ...dateRangeFields,
  })
  .refine(endAfterStart, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export const checkAvailabilityInput = z
  .object({
    roomId: z.string().min(1).max(100),
    ...dateRangeFields,
  })
  .refine(endAfterStart, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export const relocateRoomInput = z
  .object({
    bookingId: z.string().min(1).max(100),
    roomId: z.string().min(1).max(100),
    ...dateRangeFields,
  })
  .refine(endAfterStart, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export const cancelRoomInput = z.object({
  bookingId: z.string().min(1).max(100),
});

export type CreateRoomInput = z.infer<typeof createRoomInput>;
export type ListPendingRoomApprovalsInput = z.infer<
  typeof listPendingRoomApprovalsInput
>;
export type AssignRoomInput = z.infer<typeof assignRoomInput>;
export type CheckAvailabilityInput = z.infer<typeof checkAvailabilityInput>;
export type RelocateRoomInput = z.infer<typeof relocateRoomInput>;
export type CancelRoomInput = z.infer<typeof cancelRoomInput>;
