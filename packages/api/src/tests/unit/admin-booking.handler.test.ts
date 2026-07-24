import { describe, test, expect } from "bun:test";
import { applyOverrideInput } from "../../modules/admin-booking/admin-booking.types";
import {
  OVERRIDE_CATEGORIES,
  MARKS_ACTIONS,
} from "../../modules/admin-booking/admin-booking.service";

describe("AdminBookingHandler", () => {
  describe("applyOverride schema", () => {
    test("rejects invalid category via Zod enum", () => {
      const result = applyOverrideInput.safeParse({
        bookingId: "b1",
        category: "invalid_category",
        reason: "test",
      });
      expect(result.success).toBe(false);
    });

    test("rejects invalid marksAction via Zod enum", () => {
      const result = applyOverrideInput.safeParse({
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "test",
        marksAction: "invalid_action",
      });
      expect(result.success).toBe(false);
    });

    test("accepts undefined marksAction", () => {
      const result = applyOverrideInput.safeParse({
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "test",
        marksAction: undefined,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.marksAction).toBeUndefined();
      }
    });

    test("accepts all OVERRIDE_CATEGORIES", () => {
      for (const category of OVERRIDE_CATEGORIES) {
        const result = applyOverrideInput.safeParse({
          bookingId: "b1",
          category,
          reason: "test",
        });
        expect(result.success).toBe(true);
      }
    });

    test("accepts all MARKS_ACTIONS", () => {
      for (const marksAction of MARKS_ACTIONS) {
        const result = applyOverrideInput.safeParse({
          bookingId: "b1",
          category: "tutor_no_show",
          reason: "test",
          marksAction,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
