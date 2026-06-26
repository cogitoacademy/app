import { z } from "zod";

export const createSoloInput = z.object({
  tutorId: z.string(),
  availabilitySlotId: z.string(),
  modality: z.enum(["online", "offline"]),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  timezone: z.string().default("Asia/Jakarta"),
});

export const createGroupInput = z.object({
  tutorId: z.string(),
  availabilitySlotId: z.string(),
  modality: z.enum(["online", "offline"]),
  targetGroupSize: z.number().int().min(2).max(6),
  inviteeUserIds: z.array(z.string()).min(1),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  timezone: z.string().default("Asia/Jakarta"),
});

export const createSeriesInput = z.object({
  tutorId: z.string(),
  availabilitySlotId: z.string(),
  modality: z.enum(["online", "offline"]),
  sessions: z
    .array(
      z.object({
        scheduledStartAt: z.string().datetime(),
        scheduledEndAt: z.string().datetime(),
      }),
    )
    .min(2)
    .max(4),
  timezone: z.string().default("Asia/Jakarta"),
});

export const bookingActionInput = z.object({
  bookingId: z.string(),
});

export const confirmInviteInput = z.object({
  bookingId: z.string(),
});

export const declineInviteInput = z.object({
  bookingId: z.string(),
  reason: z.string().optional(),
});

export const reconfirmInput = z.object({
  bookingId: z.string(),
  accept: z.boolean(),
});

export const withdrawInput = z.object({
  bookingId: z.string(),
  reason: z.string().optional(),
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

export const listSessionsInput = z.object({
  bookingId: z.string(),
});

export type CreateSoloInput = z.infer<typeof createSoloInput>;
export type CreateGroupInput = z.infer<typeof createGroupInput>;
export type CreateSeriesInput = z.infer<typeof createSeriesInput>;
export type BookingActionInput = z.infer<typeof bookingActionInput>;
export type ConfirmInviteInput = z.infer<typeof confirmInviteInput>;
export type DeclineInviteInput = z.infer<typeof declineInviteInput>;
export type ReconfirmInput = z.infer<typeof reconfirmInput>;
export type WithdrawInput = z.infer<typeof withdrawInput>;
export type ProposeRescheduleInput = z.infer<typeof proposeRescheduleInput>;
export type CompleteSessionInput = z.infer<typeof completeSessionInput>;
