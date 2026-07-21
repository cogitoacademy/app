import type { Context } from "../../context";
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

export function createAdminBookingHandler(
  adminBookingService: AdminBookingService,
) {
  return {
    applyOverride: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminBookingService.applyOverride(context.session!.user.id, {
        bookingId: input.bookingId,
        category: validateCategory(input.category),
        reason: input.reason,
        affectedParticipants: input.affectedParticipants,
        marksAction: validateMarksAction(input.marksAction),
        userNote: input.userNote,
        internalNote: input.internalNote,
      });
    },

    listBookings: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminBookingService.listBookings(input);
    },

    getBookingStateHistory: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminBookingService.getBookingStateHistory(input.bookingId);
    },

    adminRefund: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminBookingService.adminRefund(context.session!.user.id, input);
    },
  };
}
