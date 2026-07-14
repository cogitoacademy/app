import type { AdminBookingService } from "./admin-booking.service";
import {
  OVERRIDE_CATEGORIES,
  MARKS_ACTIONS,
  type OverrideCategory,
  type MarksAction,
} from "./admin-booking.service";

const OVERRIDE_CATEGORY_SET = new Set<string>(OVERRIDE_CATEGORIES);
const MARKS_ACTION_SET = new Set<string>(MARKS_ACTIONS);

function validateCategory(value: string): OverrideCategory {
  if (!OVERRIDE_CATEGORY_SET.has(value)) {
    throw new Error(
      `Invalid override category: ${value}. Must be one of: ${OVERRIDE_CATEGORIES.join(", ")}`,
    );
  }
  return value as OverrideCategory;
}

function validateMarksAction(
  value: string | undefined,
): MarksAction | undefined {
  if (value === undefined) return undefined;
  if (!MARKS_ACTION_SET.has(value)) {
    throw new Error(
      `Invalid marks action: ${value}. Must be one of: ${MARKS_ACTIONS.join(", ")}`,
    );
  }
  return value as MarksAction;
}

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
      category: validateCategory(input.category),
      reason: input.reason,
      affectedParticipants: input.affectedParticipants,
      marksAction: validateMarksAction(input.marksAction),
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
