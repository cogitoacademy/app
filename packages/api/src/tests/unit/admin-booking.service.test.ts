import { describe, test, expect, mock } from "bun:test";
import { createAdminBookingService } from "../../modules/admin-booking/admin-booking.service";
import {
  BookingNotFoundError,
  InvalidRefundStateError,
  TerminalStateOverrideError,
} from "../../modules/admin-booking/admin-booking.errors";

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
    updateBookingHoldAmount: mock(async () => {}),
    ...overrides,
  };
}

function makeAuditPort() {
  return { record: mock(async () => {}) };
}

function makeWalletPort(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function makeRefundPort() {
  return {
    createRefundRecord: mock(async () => {}),
  };
}

describe("AdminBookingService", () => {
  describe("applyOverride", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      try {
        await service.applyOverride("admin1", {
          bookingId: "nonexistent",
          category: "tutor_no_show",
          reason: "Tutor did not show up",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(BookingNotFoundError);
        expect(e.code).toBe("ADMIN_BOOKING_NOT_FOUND");
      }
    });

    test("throws TerminalStateOverrideError when booking is in terminal state", async () => {
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
        refund: makeRefundPort(),
      });

      try {
        await service.applyOverride("admin1", {
          bookingId: "b1",
          category: "tutor_no_show",
          reason: "Test",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(TerminalStateOverrideError);
        expect(e.code).toBe("TERMINAL_STATE_OVERRIDE");
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
        refund: makeRefundPort(),
      });

      const result = await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "Tutor no-show",
      });

      expect(result).toBeDefined();
      expect(auditPort.record).toHaveBeenCalled();
    });

    test("release_holds calls wallet.release for participants with heldAmount > 0", async () => {
      const wallet = makeWalletPort();
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
          { id: "p2", userId: "u2", heldAmount: 30 },
        ]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "Release holds",
        marksAction: "release_holds",
        affectedParticipants: ["u1", "u2"],
      });

      expect(wallet.release).toHaveBeenCalledTimes(2);
      expect(wallet.release).toHaveBeenCalledWith(expect.anything(), {
        walletId: "w1",
        amount: 50,
        eventKey: "override.release.b1.p1",
        actorType: "admin",
        reason: "Admin override: Release holds",
        bookingId: "b1",
      });
      expect(wallet.release).toHaveBeenCalledWith(expect.anything(), {
        walletId: "w1",
        amount: 30,
        eventKey: "override.release.b1.p2",
        actorType: "admin",
        reason: "Admin override: Release holds",
        bookingId: "b1",
      });
    });

    test("compensate_credit calls wallet.compensate with type compensate_credit", async () => {
      const wallet = makeWalletPort();
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
        ]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "medical_emergency",
        reason: "Credit compensation",
        marksAction: "compensate_credit",
        affectedParticipants: ["u1"],
      });

      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(wallet.compensate).toHaveBeenCalledWith(expect.anything(), {
        walletId: "w1",
        amount: 50,
        eventKey: "override.compensate_credit.b1.p1",
        actorType: "admin",
        reason: "Admin override credit: Credit compensation",
        type: "compensate_credit",
        bookingId: "b1",
      });
    });

    test("compensate_credit uses per-participant heldAmount, not booking total", async () => {
      const wallet = makeWalletPort();
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 30 },
          { id: "p2", userId: "u2", heldAmount: 70 },
        ]),
      });
      wallet.getByUserId = mock(async (_tx: any, userId: string) => ({
        id: `w-${userId}`,
        totalBalance: 100,
        heldBalance: userId === "u1" ? 30 : 70,
        availableBalance: 70,
      }));
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "medical_emergency",
        reason: "test",
        marksAction: "compensate_credit",
        affectedParticipants: ["u1", "u2"],
      });

      const calls = wallet.compensate.mock.calls;
      const u1Call = calls.find((c: any) => c[1]?.walletId === "w-u1");
      const u2Call = calls.find((c: any) => c[1]?.walletId === "w-u2");

      expect(u1Call[1].amount).toBe(30);
      expect(u2Call[1].amount).toBe(70);
    });

    test("compensate_deduct calls wallet.compensate with type compensate_deduct", async () => {
      const wallet = makeWalletPort();
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 75 },
        ]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "technical_failure",
        reason: "Deduct compensation",
        marksAction: "compensate_deduct",
        affectedParticipants: ["u1"],
      });

      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(wallet.compensate).toHaveBeenCalledWith(expect.anything(), {
        walletId: "w1",
        amount: 75,
        eventKey: "override.compensate_deduct.b1.p1",
        actorType: "admin",
        reason: "Admin override deduct: Deduct compensation",
        type: "compensate_deduct",
        bookingId: "b1",
      });
    });

    test("skips participant when wallet not found (getByUserId returns null)", async () => {
      const wallet = makeWalletPort({
        getByUserId: mock(async () => null),
      });
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
        ]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "No wallet",
        marksAction: "release_holds",
        affectedParticipants: ["u1"],
      });

      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.compensate).not.toHaveBeenCalled();
      expect(auditPort.record).toHaveBeenCalled();
    });

    test("skips release_holds for participant with heldAmount=0", async () => {
      const wallet = makeWalletPort();
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 0 },
        ]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "No held amount",
        marksAction: "release_holds",
        affectedParticipants: ["u1"],
      });

      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.compensate).not.toHaveBeenCalled();
    });

    test("skips compensate_credit for participant with heldAmount=0", async () => {
      const wallet = makeWalletPort();
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 0 },
        ]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "medical_emergency",
        reason: "No held amount",
        marksAction: "compensate_credit",
        affectedParticipants: ["u1"],
      });

      expect(wallet.compensate).not.toHaveBeenCalled();
      expect(wallet.release).not.toHaveBeenCalled();
    });

    test("does not process marks when holdAmount is 0 on booking", async () => {
      const wallet = makeWalletPort();
      const repo = mockRepo({
        findBookingById: mock(async () => ({
          id: "b1",
          currentState: "confirmed",
          holdAmount: 0,
        })),
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
        ]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "No hold amount on booking",
        marksAction: "release_holds",
        affectedParticipants: ["u1"],
      });

      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.compensate).not.toHaveBeenCalled();
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
        refund: makeRefundPort(),
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
        refund: makeRefundPort(),
      });

      const result = await service.listBookings({ bookingId: "b1" });
      expect(result.items).toEqual([booking]);
    });

    test("returns empty list when bookingId provided but not found", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      const result = await service.listBookings({ bookingId: "nonexistent" });
      expect(result.items).toEqual([]);
    });

    test("returns bookings with limit from repo", async () => {
      const bookings = [
        { id: "b1", currentState: "confirmed" },
        { id: "b2", currentState: "pending" },
        { id: "b3", currentState: "completed" },
      ];
      const repo = mockRepo({
        listBookingsByState: mock(async () => bookings),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      const result = await service.listBookings({ limit: 2 });
      expect(result.items).toEqual([
        { id: "b1", currentState: "confirmed" },
        { id: "b2", currentState: "pending" },
      ]);
      expect(repo.listBookingsByState).toHaveBeenCalledWith(
        expect.anything(),
        [],
        2,
        undefined,
      );
    });

    test("passes cursor to repo for pagination", async () => {
      const bookings = [
        { id: "b10", currentState: "confirmed" },
        { id: "b11", currentState: "confirmed" },
        { id: "b12", currentState: "confirmed" },
      ];
      const repo = mockRepo({
        listBookingsByState: mock(async () => bookings),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      const result = await service.listBookings({ limit: 2, cursor: "b9" });
      expect(repo.listBookingsByState).toHaveBeenCalledWith(
        expect.anything(),
        [],
        2,
        "b9",
      );
      expect(result.items).toEqual([
        { id: "b10", currentState: "confirmed" },
        { id: "b11", currentState: "confirmed" },
      ]);
    });
  });

  describe("getBookingStateHistory", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      try {
        await service.getBookingStateHistory("nonexistent");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(BookingNotFoundError);
        expect(e.code).toBe("ADMIN_BOOKING_NOT_FOUND");
      }
    });

    test("returns state history when booking exists", async () => {
      const history = [
        { bookingId: "b1", fromState: "pending", toState: "confirmed" },
        { bookingId: "b1", fromState: "confirmed", toState: "completed" },
      ];
      const repo = mockRepo({
        getStateHistory: mock(async () => history),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      const result = await service.getBookingStateHistory("b1");
      expect(result).toEqual(history);
      expect(repo.getStateHistory).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
      );
    });
  });

  describe("adminRefund", () => {
    test("throws BookingNotFoundError when payment does not exist", async () => {
      const repo = mockRepo({
        findPaymentById: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      try {
        await service.adminRefund("admin1", {
          paymentId: "nonexistent",
          reason: "Test refund",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(BookingNotFoundError);
        expect(e.code).toBe("ADMIN_BOOKING_NOT_FOUND");
      }
    });

    test("throws InvalidRefundStateError when payment is not in refundable state", async () => {
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
        refund: makeRefundPort(),
      });

      try {
        await service.adminRefund("admin1", {
          paymentId: "pay1",
          reason: "Test refund",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(InvalidRefundStateError);
        expect(e.code).toBe("INVALID_REFUND_STATE");
      }
    });

    test("success with PAID payment", async () => {
      const wallet = makeWalletPort();
      const auditPort = makeAuditPort();
      const refund = makeRefundPort();
      const repo = mockRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "u1",
          status: "PAID",
          marks: 50,
          amountIdr: 100000,
        })),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund,
      });

      const result = await service.adminRefund("admin1", {
        paymentId: "pay1",
        reason: "Full refund",
      });

      expect(result).toEqual({ paymentId: "pay1", status: "refunded" });
      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(wallet.compensate).toHaveBeenCalledWith(expect.anything(), {
        walletId: "w1",
        amount: 50,
        eventKey: "refund.pay1",
        sourceReference: "pay1",
        actorType: "admin",
        reason: "Admin refund: Full refund",
        type: "compensate_credit",
      });
      expect(repo.updatePaymentStatus).toHaveBeenCalledWith(
        expect.anything(),
        "pay1",
        "REFUNDED",
      );
      expect(refund.createRefundRecord).toHaveBeenCalledWith(
        expect.anything(),
        {
          paymentId: "pay1",
          walletId: "w1",
          amountIdr: 100000,
          marks: 50,
          reason: "Full refund",
          actorId: "admin1",
        },
      );
      expect(auditPort.record).toHaveBeenCalledTimes(1);
    });

    test("success with SETTLED payment", async () => {
      const wallet = makeWalletPort();
      const auditPort = makeAuditPort();
      const refund = makeRefundPort();
      const repo = mockRepo({
        findPaymentById: mock(async () => ({
          id: "pay2",
          userId: "u1",
          status: "SETTLED",
          marks: 75,
          amountIdr: 150000,
        })),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund,
      });

      const result = await service.adminRefund("admin1", {
        paymentId: "pay2",
        reason: "Settled refund",
      });

      expect(result).toEqual({ paymentId: "pay2", status: "refunded" });
      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(wallet.compensate).toHaveBeenCalledWith(expect.anything(), {
        walletId: "w1",
        amount: 75,
        eventKey: "refund.pay2",
        sourceReference: "pay2",
        actorType: "admin",
        reason: "Admin refund: Settled refund",
        type: "compensate_credit",
      });
      expect(repo.updatePaymentStatus).toHaveBeenCalledWith(
        expect.anything(),
        "pay2",
        "REFUNDED",
      );
      expect(refund.createRefundRecord).toHaveBeenCalledWith(
        expect.anything(),
        {
          paymentId: "pay2",
          walletId: "w1",
          amountIdr: 150000,
          marks: 75,
          reason: "Settled refund",
          actorId: "admin1",
        },
      );
      expect(auditPort.record).toHaveBeenCalledTimes(1);
    });

    test("throws BookingNotFoundError when wallet not found for user", async () => {
      const wallet = makeWalletPort({
        getByUserId: mock(async () => null),
      });
      const repo = mockRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "u1",
          status: "PAID",
          marks: 50,
        })),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      try {
        await service.adminRefund("admin1", {
          paymentId: "pay1",
          reason: "Wallet missing",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(BookingNotFoundError);
        expect(e.code).toBe("ADMIN_BOOKING_NOT_FOUND");
      }
    });
  });
});
