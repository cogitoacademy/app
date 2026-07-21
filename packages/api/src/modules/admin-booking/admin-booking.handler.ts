import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { badRequest, internalServerError } from "../../lib/errors";
import {
  OVERRIDE_CATEGORIES,
  MARKS_ACTIONS,
  type OverrideCategory,
  type MarksAction,
} from "./admin-booking.service";
import type { AdminBookingService } from "./admin-booking.service";
import {
  applyOverrideInput,
  listOverridesInput,
  getBookingStateHistoryInput,
  adminRefundInput,
} from "./admin-booking.types";

type ApplyOverrideInput = z.infer<typeof applyOverrideInput>;
type ListOverridesInput = z.infer<typeof listOverridesInput>;
type GetBookingStateHistoryInput = z.infer<typeof getBookingStateHistoryInput>;
type AdminRefundInput = z.infer<typeof adminRefundInput>;

const OVERRIDE_CATEGORY_SET = new Set<string>(OVERRIDE_CATEGORIES);
const MARKS_ACTION_SET = new Set<string>(MARKS_ACTIONS);

function validateCategory(value: string): OverrideCategory {
  if (!OVERRIDE_CATEGORY_SET.has(value)) {
    throw badRequest(
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
    throw badRequest(
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
      input: ApplyOverrideInput;
    }) => {
      try {
        return adminBookingService.applyOverride(context.session!.user.id, {
          bookingId: input.bookingId,
          category: validateCategory(input.category),
          reason: input.reason,
          affectedParticipants: input.affectedParticipants,
          marksAction: validateMarksAction(input.marksAction),
          userNote: input.userNote,
          internalNote: input.internalNote,
        });
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to apply override", err);
      }
    },

    listBookings: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListOverridesInput;
    }) => {
      try {
        return adminBookingService.listBookings(input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list bookings", err);
      }
    },

    getBookingStateHistory: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: GetBookingStateHistoryInput;
    }) => {
      try {
        return adminBookingService.getBookingStateHistory(input.bookingId);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch booking state history", err);
      }
    },

    adminRefund: async ({
      context,
      input,
    }: {
      context: Context;
      input: AdminRefundInput;
    }) => {
      try {
        return adminBookingService.adminRefund(context.session!.user.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to process admin refund", err);
      }
    },
  };
}
