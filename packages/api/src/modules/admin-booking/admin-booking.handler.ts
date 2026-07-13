import type { AdminBookingService } from "./admin-booking.service";

export type AdminBookingHandler = ReturnType<typeof createAdminBookingHandler>;

export function createAdminBookingHandler(deps: {
  adminBookingService: AdminBookingService;
}) {
  const { adminBookingService } = deps;

  async function applyOverride(
    adminId: string,
    input: {
      bookingId: string;
      category: string;
      reason: string;
      affectedParticipants?: string[];
      marksAction?: string;
      userNote?: string;
      internalNote?: string;
    },
  ) {
    return adminBookingService.applyOverride(adminId, {
      bookingId: input.bookingId,
      category: input.category as
        | "tutor_no_show"
        | "medical_emergency"
        | "technical_failure"
        | "admin_correction"
        | "student_no_show"
        | "force_cancel",
      reason: input.reason,
      affectedParticipants: input.affectedParticipants,
      marksAction: input.marksAction as
        | "release_holds"
        | "compensate_credit"
        | "compensate_deduct"
        | undefined,
      userNote: input.userNote,
      internalNote: input.internalNote,
    });
  }

  async function listBookings(input?: {
    bookingId?: string;
    limit?: number;
    cursor?: string;
  }) {
    return adminBookingService.listBookings(input);
  }

  async function getBookingStateHistory(bookingId: string) {
    return adminBookingService.getBookingStateHistory(bookingId);
  }

  async function adminRefund(
    adminId: string,
    input: { paymentId: string; reason: string },
  ) {
    return adminBookingService.adminRefund(adminId, input);
  }

  return { applyOverride, listBookings, getBookingStateHistory, adminRefund };
}
