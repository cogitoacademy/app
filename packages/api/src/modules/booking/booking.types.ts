import { z } from "zod";

export const createSoloInput = z.object({
  tutorId: z.string(),
  availabilitySlotId: z.string(),
  modality: z.enum(["online", "offline"]),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  timezone: z.string().default("Asia/Jakarta"),
});

export const bookingActionInput = z.object({
  bookingId: z.string(),
});

export const proposeRescheduleInput = z.object({
  bookingId: z.string(),
  proposedStartAt: z.string().datetime(),
  proposedEndAt: z.string().datetime(),
  reason: z.string().optional(),
});

export const completeSessionInput = z.object({
  bookingId: z.string(),
  sessionNote: z.string().optional(),
});

export const getBookingInput = z.object({
  bookingId: z.string(),
});

export const listMineInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  states: z.array(z.string()).optional(),
});

export type CreateSoloInput = z.infer<typeof createSoloInput>;
export type BookingActionInput = z.infer<typeof bookingActionInput>;
export type ProposeRescheduleInput = z.infer<typeof proposeRescheduleInput>;
export type CompleteSessionInput = z.infer<typeof completeSessionInput>;
