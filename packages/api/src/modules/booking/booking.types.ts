import { z } from "zod";

export const createSoloInput = z
  .object({
    tutorId: z.string().max(100),
    availabilitySlotId: z.string().max(100),
    modality: z.enum(["online", "offline"]),
    scheduledStartAt: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    scheduledEndAt: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    timezone: z.string().max(50).default("Asia/Jakarta"),
  })
  .refine((d) => d.scheduledEndAt > d.scheduledStartAt, {
    message: "scheduledEndAt must be after scheduledStartAt",
    path: ["scheduledEndAt"],
  });

export const createGroupInput = z
  .object({
    tutorId: z.string().max(100),
    availabilitySlotId: z.string().max(100),
    modality: z.enum(["online", "offline"]),
    targetGroupSize: z.number().int().min(2).max(6),
    inviteeUserIds: z.array(z.string().max(100)).min(1).max(5),
    scheduledStartAt: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    scheduledEndAt: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    timezone: z.string().max(50).default("Asia/Jakarta"),
  })
  .refine((d) => d.scheduledEndAt > d.scheduledStartAt, {
    message: "scheduledEndAt must be after scheduledStartAt",
    path: ["scheduledEndAt"],
  });

export const createSeriesInput = z.object({
  tutorId: z.string().max(100),
  availabilitySlotId: z.string().max(100),
  modality: z.enum(["online", "offline"]),
  sessions: z
    .array(
      z
        .object({
          scheduledStartAt: z.coerce
            .date()
            .refine((d) => d > new Date(), "Must be in the future"),
          scheduledEndAt: z.coerce
            .date()
            .refine((d) => d > new Date(), "Must be in the future"),
        })
        .refine((d) => d.scheduledEndAt > d.scheduledStartAt, {
          message: "scheduledEndAt must be after scheduledStartAt",
          path: ["scheduledEndAt"],
        }),
    )
    .min(2)
    .max(4),
  timezone: z.string().max(50).default("Asia/Jakarta"),
});

export const createGroupSeriesInput = z.object({
  tutorId: z.string().max(100),
  availabilitySlotId: z.string().max(100),
  modality: z.enum(["online", "offline"]),
  targetGroupSize: z.number().int().min(2).max(6),
  inviteeUserIds: z.array(z.string().max(100)).min(1).max(5),
  sessions: z
    .array(
      z
        .object({
          scheduledStartAt: z.coerce
            .date()
            .refine((d) => d > new Date(), "Must be in the future"),
          scheduledEndAt: z.coerce
            .date()
            .refine((d) => d > new Date(), "Must be in the future"),
        })
        .refine((d) => d.scheduledEndAt > d.scheduledStartAt, {
          message: "scheduledEndAt must be after scheduledStartAt",
          path: ["scheduledEndAt"],
        }),
    )
    .min(2)
    .max(4),
  timezone: z.string().max(50).default("Asia/Jakarta"),
});

export const bookingActionInput = z.object({
  bookingId: z.string().max(100),
});

export const cancelBookingInput = bookingActionInput.extend({
  cancellationReason: z.string().max(500).optional(),
});

export const declineBookingInput = bookingActionInput.extend({
  reason: z.string().max(500).optional(),
});

export const confirmInviteInput = z.object({
  bookingId: z.string().max(100),
});

export const declineInviteInput = z.object({
  bookingId: z.string().max(100),
  reason: z.string().max(2000).optional(),
});

export const reconfirmInput = z.object({
  bookingId: z.string().max(100),
  accept: z.boolean(),
});

export const withdrawInput = z.object({
  bookingId: z.string().max(100),
  reason: z.string().max(2000).optional(),
});

export const proposeRescheduleInput = z
  .object({
    bookingId: z.string().max(100),
    proposedStartAt: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    proposedEndAt: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    reason: z.string().max(2000).optional(),
  })
  .refine((d) => d.proposedEndAt > d.proposedStartAt, {
    message: "proposedEndAt must be after proposedStartAt",
    path: ["proposedEndAt"],
  });

export const completeSessionInput = z.object({
  bookingId: z.string().max(100),
  sessionId: z.string().max(100).optional(),
});

export const cancelSessionInput = z.object({
  sessionId: z.string().max(100),
});

export const acceptRescheduleInput = bookingActionInput;
export const rejectRescheduleInput = bookingActionInput;

export const addSessionNoteInput = z.object({
  bookingId: z.string().max(100),
  content: z.string().max(10000),
});

export const getSessionNotesInput = bookingActionInput;

export const markAttendanceInput = z.object({
  bookingId: z.string().max(100),
  attendance: z.enum(["present", "late"]),
});

export const getBookingInput = z.object({
  bookingId: z.string().max(100),
});

export const listMineInput = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  states: z.array(z.string().max(100)).max(15).optional(),
});

export const listSessionsInput = z.object({
  bookingId: z.string().max(100),
});

export type CreateSoloInput = z.infer<typeof createSoloInput>;
export type CreateGroupInput = z.infer<typeof createGroupInput>;
export type CreateSeriesInput = z.infer<typeof createSeriesInput>;
export type CreateGroupSeriesInput = z.infer<typeof createGroupSeriesInput>;
export type BookingActionInput = z.infer<typeof bookingActionInput>;
export type ConfirmInviteInput = z.infer<typeof confirmInviteInput>;
export type DeclineInviteInput = z.infer<typeof declineInviteInput>;
export type ReconfirmInput = z.infer<typeof reconfirmInput>;
export type WithdrawInput = z.infer<typeof withdrawInput>;
export type ProposeRescheduleInput = z.infer<typeof proposeRescheduleInput>;
export type CompleteSessionInput = z.infer<typeof completeSessionInput>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceInput>;
