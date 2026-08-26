import { z } from "zod";

const id = z.string().min(1).max(100);

export const listForBookingInput = z.object({
  bookingId: id,
});

export const requestContactInput = z.object({
  bookingId: id,
  recipientId: id,
  message: z.string().trim().max(200).optional(),
});

export const respondContactRequestInput = z.object({
  requestId: id,
  decision: z.enum(["accept_share_email", "accept_without_email", "decline"]),
});

export type ListForBookingInput = z.infer<typeof listForBookingInput>;
export type RequestContactInput = z.infer<typeof requestContactInput>;
export type RespondContactRequestInput = z.infer<
  typeof respondContactRequestInput
>;
