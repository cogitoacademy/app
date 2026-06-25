export type SupportCategory =
  | "tutor_no_show"
  | "tutor_late"
  | "student_emergency"
  | "payment_wallet"
  | "platform_error"
  | "offline_room"
  | "admin_correction";

export interface SupportTicketParams {
  reporterId: string;
  bookingId: string;
  category: SupportCategory;
  reason: string;
}

export interface SupportPort {
  createTicket(
    params: SupportTicketParams,
  ): Promise<{ id: string; slaDeadlineAt: Date }>;
  listQueue(): Promise<unknown[]>;
  acknowledge(ticketId: string): Promise<void>;
  resolve(ticketId: string, resolution: string): Promise<void>;
}
