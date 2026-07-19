import { describe, test, expect, mock } from "bun:test";
import { createAdminBookingHandler } from "../../modules/admin-booking/admin-booking.handler";
import {
  OVERRIDE_CATEGORIES,
  MARKS_ACTIONS,
} from "../../modules/admin-booking/admin-booking.service";

describe("AdminBookingHandler", () => {
  describe("applyOverride", () => {
    test("throws error for invalid category", async () => {
      const applyOverride = mock(async () => ({}));
      const adminBookingService = { applyOverride };
      const handler = createAdminBookingHandler({
        adminBookingService: adminBookingService as any,
      });

      try {
        await handler.applyOverride("admin1", {
          bookingId: "b1",
          category: "invalid_category",
          reason: "test",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("Invalid override category");
        expect(e.message).toContain("invalid_category");
        expect(OVERRIDE_CATEGORIES.join(", ")).toBeDefined();
      }

      expect(applyOverride).not.toHaveBeenCalled();
    });

    test("throws error for invalid marksAction", async () => {
      const applyOverride = mock(async () => ({}));
      const adminBookingService = { applyOverride };
      const handler = createAdminBookingHandler({
        adminBookingService: adminBookingService as any,
      });

      try {
        await handler.applyOverride("admin1", {
          bookingId: "b1",
          category: "tutor_no_show",
          reason: "test",
          marksAction: "invalid_action",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("Invalid marks action");
        expect(e.message).toContain("invalid_action");
      }

      expect(applyOverride).not.toHaveBeenCalled();
    });

    test("passes undefined marksAction through as undefined", async () => {
      const applyOverride = mock(async () => ({
        id: "b1",
        currentState: "no_show",
      }));
      const adminBookingService = { applyOverride };
      const handler = createAdminBookingHandler({
        adminBookingService: adminBookingService as any,
      });

      await handler.applyOverride("admin1", {
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "test",
        marksAction: undefined,
      });

      expect(applyOverride).toHaveBeenCalledWith(
        "admin1",
        expect.objectContaining({
          marksAction: undefined,
        }),
      );
    });

    test("passes valid category and marksAction to service", async () => {
      const applyOverride = mock(async () => ({
        id: "b1",
        currentState: "cancelled",
      }));
      const adminBookingService = { applyOverride };
      const handler = createAdminBookingHandler({
        adminBookingService: adminBookingService as any,
      });

      await handler.applyOverride("admin1", {
        bookingId: "b1",
        category: "medical_emergency",
        reason: "test reason",
        marksAction: "release_holds",
      });

      expect(applyOverride).toHaveBeenCalledWith("admin1", {
        bookingId: "b1",
        category: "medical_emergency",
        reason: "test reason",
        affectedParticipants: undefined,
        marksAction: "release_holds",
        userNote: undefined,
        internalNote: undefined,
      });
    });

    test("validates each OVERRIDE_CATEGORY is accepted", async () => {
      const applyOverride = mock(async () => ({}));
      const adminBookingService = { applyOverride };
      const handler = createAdminBookingHandler({
        adminBookingService: adminBookingService as any,
      });

      for (const category of OVERRIDE_CATEGORIES) {
        applyOverride.mockClear();
        // eslint-disable-next-line no-await-in-loop
        await handler.applyOverride("admin1", {
          bookingId: "b1",
          category,
          reason: "test",
        });
        expect(applyOverride).toHaveBeenCalledTimes(1);
      }
    });

    test("validates each MARKS_ACTIONS is accepted", async () => {
      const applyOverride = mock(async () => ({}));
      const adminBookingService = { applyOverride };
      const handler = createAdminBookingHandler({
        adminBookingService: adminBookingService as any,
      });

      for (const marksAction of MARKS_ACTIONS) {
        applyOverride.mockClear();
        // eslint-disable-next-line no-await-in-loop
        await handler.applyOverride("admin1", {
          bookingId: "b1",
          category: "tutor_no_show",
          reason: "test",
          marksAction,
        });
        expect(applyOverride).toHaveBeenCalledTimes(1);
      }
    });
  });
});
