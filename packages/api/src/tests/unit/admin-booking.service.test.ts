import { describe, test, expect, mock } from "bun:test";
import { createAdminBookingService } from "../../modules/admin-booking/admin-booking.service";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      const tx = {
        ...makeDb(),
        ...mockRepo(),
      };
      return fn(tx);
    }),
  } as any;
}

function mockRepo(overrides: Record<string, unknown> = {}) {
  return {
    findBookingById: mock(async () => ({
      id: "b1",
      currentState: "confirmed",
      holdAmount: 100,
    })),
    updateBookingWithOverride: mock(async () => ({
      previousState: "confirmed",
      updated: { id: "b1", currentState: "cancelled" },
    })),
    insertStateHistoryEntry: mock(async () => {}),
    findParticipantsByBookingId: mock(async () => []),
    findPaymentById: mock(async () => ({
      id: "pay1",
      userId: "u1",
      status: "PAID",
      marks: 50,
    })),
    updatePaymentStatus: mock(async () => ({
      id: "pay1",
      status: "REFUNDED",
    })),
    listBookingsByState: mock(async () => []),
    getStateHistory: mock(async () => []),
    ...overrides,
  };
}

function makeAuditPort() {
  return { record: mock(async () => {}) };
}

function makeWalletPort() {
  return {
    getByUserId: mock(async () => ({
      id: "w1",
      totalBalance: 200,
      heldBalance: 0,
      availableBalance: 200,
    })),
    compensate: mock(async () => ({
      id: "w1",
      totalBalance: 250,
      heldBalance: 0,
      availableBalance: 250,
    })),
    release: mock(async () => ({
      id: "w1",
      totalBalance: 200,
      heldBalance: 0,
      availableBalance: 200,
    })),
    getById: mock(async () => ({
      id: "w1",
      totalBalance: 200,
      heldBalance: 0,
      availableBalance: 200,
    })),
  };
}

function makeRefundRepo() {
  return {
    insertRefundRecord: mock(async () => ({})),
    findPaymentByReference: mock(async () => null),
    updatePaymentStatus: mock(async () => null),
  };
}

describe("AdminBookingService", () => {
  describe("applyOverride", () => {
    test("throws notFound when booking does not exist", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refundRepo: makeRefundRepo() as any,
      });

      try {
        await service.applyOverride("admin1", {
          bookingId: "nonexistent",
          category: "tutor_no_show",
          reason: "Tutor did not show up",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("not found");
      }
    });

    test("throws badRequest when booking is in terminal state", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => ({
          id: "b1",
          currentState: "completed",
          holdAmount: 0,
        })),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refundRepo: makeRefundRepo() as any,
      });

      try {
        await service.applyOverride("admin1", {
          bookingId: "b1",
          category: "tutor_no_show",
          reason: "Test",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("terminal");
      }
    });

    test("applies override and returns updated booking", async () => {
      const repo = mockRepo();
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: makeWalletPort() as any,
      });

      const result = await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "Tutor no-show",
      });

      expect(result).toBeDefined();
      expect(auditPort.record).toHaveBeenCalled();
    });
  });

  describe("listBookings", () => {
    test("returns empty list when no bookings found", async () => {
      const repo = mockRepo();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refundRepo: makeRefundRepo() as any,
      });

      const result = await service.listBookings();
      expect(result.items).toEqual([]);
    });

    test("looks up specific booking when bookingId provided", async () => {
      const booking = { id: "b1", currentState: "confirmed" };
      const repo = mockRepo({
        findBookingById: mock(async () => booking),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refundRepo: makeRefundRepo() as any,
      });

      const result = await service.listBookings({ bookingId: "b1" });
      expect(result.items).toEqual([booking]);
    });
  });

  describe("getBookingStateHistory", () => {
    test("throws notFound when booking does not exist", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refundRepo: makeRefundRepo() as any,
      });

      try {
        await service.getBookingStateHistory("nonexistent");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("not found");
      }
    });
  });

  describe("adminRefund", () => {
    test("throws notFound when payment does not exist", async () => {
      const repo = mockRepo({
        findPaymentById: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refundRepo: makeRefundRepo() as any,
      });

      try {
        await service.adminRefund("admin1", {
          paymentId: "nonexistent",
          reason: "Test refund",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("not found");
      }
    });

    test("throws badRequest when payment is not in refundable state", async () => {
      const repo = mockRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "u1",
          status: "PENDING",
          marks: 50,
        })),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refundRepo: makeRefundRepo() as any,
      });

      try {
        await service.adminRefund("admin1", {
          paymentId: "pay1",
          reason: "Test refund",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toContain("PAID or SETTLED");
      }
    });
  });
});
