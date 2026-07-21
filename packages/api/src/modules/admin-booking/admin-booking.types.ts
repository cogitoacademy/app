import { z } from "zod";

export const applyOverrideInput = z.object({
  bookingId: z.string(),
  category: z.enum([
    "tutor_no_show",
    "medical_emergency",
    "technical_failure",
    "admin_correction",
    "student_no_show",
    "force_cancel",
  ]),
  reason: z.string().min(1),
  affectedParticipants: z.array(z.string()).optional(),
  marksAction: z
    .enum(["release_holds", "compensate_credit", "compensate_deduct"])
    .optional(),
  userNote: z.string().optional(),
  internalNote: z.string().optional(),
});

export const listOverridesInput = z.object({
  bookingId: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const getBookingStateHistoryInput = z.object({
  bookingId: z.string(),
});

export const adminRefundInput = z.object({
  paymentId: z.string(),
  reason: z.string().min(1),
});
