import { describe, test, expect, mock } from "bun:test";
import { createAdminBookingService } from "../../modules/admin-booking/admin-booking.service";
import {
  BookingNotFoundError,
  InvalidRefundStateError,
  OverrideMarksParticipantsRequiredError,
  OverrideParticipantNotInBookingError,
  TerminalStateOverrideError,
  RefundSpendExhaustedError,
} from "../../modules/admin-booking/admin-booking.errors";
import { BookingStateTransitionError } from "../../modules/booking/booking.errors";

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
    listCreditStatePaymentsForUser: mock(async () => []),
    listBookingsByState: mock(async () => []),
    getStateHistory: mock(async () => []),
    updateBookingHoldAmount: mock(async () => {}),
    updateParticipantHeldAmount: mock(async () => {}),
    updatePaymentStatusIfRefundable: mock(async () => ({
      id: "pay1",
      status: "REFUNDED",
    })),
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
    sumCreditedMarks: mock(async () => 200),
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

function makeNotificationPort() {
  return {
    writeBestEffort: mock(async () => {}),
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
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

    test("compensate actions release the hold first so nothing is stranded (H7)", async () => {
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

      // release (held -> available) happens before the compensation deduct.
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release).toHaveBeenCalledWith(expect.anything(), {
        walletId: "w1",
        amount: 75,
        eventKey: "override.release.b1.p1",
        actorType: "admin",
        reason: "Admin override: Deduct compensation",
        bookingId: "b1",
      });
      expect(wallet.compensate).toHaveBeenCalledTimes(1);
      expect(repo.updateParticipantHeldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        0,
      );
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

    test("processes marks when participants hold even if booking holdAmount is 0 (L7)", async () => {
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

      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.compensate).not.toHaveBeenCalled();
      expect(repo.updateParticipantHeldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        0,
      );
    });

    test("throws OverrideMarksParticipantsRequiredError when marksAction has no affectedParticipants (M1)", async () => {
      const wallet = makeWalletPort();
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
        ]),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: wallet as any,
        refund: makeRefundPort(),
      });

      try {
        await service.applyOverride("admin1", {
          bookingId: "b1",
          category: "tutor_no_show",
          reason: "No participants listed",
          marksAction: "release_holds",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(OverrideMarksParticipantsRequiredError);
        expect(e.code).toBe("OVERRIDE_MARKS_PARTICIPANTS_REQUIRED");
      }
      expect(repo.updateBookingWithOverride).not.toHaveBeenCalled();
      expect(wallet.release).not.toHaveBeenCalled();
    });

    test("throws OverrideMarksParticipantsRequiredError for empty affectedParticipants array (M1)", async () => {
      const service = createAdminBookingService({
        db: makeDb(),
        repo: mockRepo(),
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      await expect(
        service.applyOverride("admin1", {
          bookingId: "b1",
          category: "force_cancel",
          reason: "Empty list",
          marksAction: "compensate_deduct",
          affectedParticipants: [],
        }),
      ).rejects.toThrow(OverrideMarksParticipantsRequiredError);
    });

    test("cancels the provider meeting after a terminal override commits (H6)", async () => {
      const meeting = {
        setManualLink: mock(async () => ({}) as any),
        cancelEvent: mock(async () => {}),
      };
      const repo = mockRepo({
        findBookingById: mock(async () => {
          const calls = repo.findBookingById.mock.calls.length;
          return calls === 1
            ? { id: "b1", currentState: "confirmed", holdAmount: 100 }
            : { id: "b1", currentState: "cancelled", holdAmount: 0 };
        }),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting,
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "force_cancel",
        reason: "Cancel meeting",
      });

      expect(meeting.cancelEvent).toHaveBeenCalledTimes(1);
      expect(meeting.cancelEvent).toHaveBeenCalledWith("b1");
    });

    test("does not cancel the meeting when the override target is not terminal (H6)", async () => {
      const meeting = {
        setManualLink: mock(async () => ({}) as any),
        cancelEvent: mock(async () => {}),
      };
      const repo = mockRepo({
        updateBookingWithOverride: mock(async () => ({
          previousState: "confirmed",
          updated: { id: "b1", currentState: "confirmed" },
        })),
        findBookingById: mock(async () => ({
          id: "b1",
          currentState: "confirmed",
          holdAmount: 100,
        })),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting,
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "admin_correction",
        reason: "Non-terminal correction",
      });

      expect(meeting.cancelEvent).not.toHaveBeenCalled();
    });

    test("meeting cancel failure does not break the override (H6 best-effort)", async () => {
      const meeting = {
        setManualLink: mock(async () => ({}) as any),
        cancelEvent: mock(async () => {
          throw new Error("Google API down");
        }),
      };
      const repo = mockRepo({
        findBookingById: mock(async () => {
          const calls = repo.findBookingById.mock.calls.length;
          return calls === 1
            ? { id: "b1", currentState: "confirmed", holdAmount: 100 }
            : { id: "b1", currentState: "cancelled", holdAmount: 0 };
        }),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting,
      });

      const result = await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "force_cancel",
        reason: "Cancel despite Google failure",
      });

      expect(result).toBeDefined();
      expect(result.currentState).toBe("cancelled");
    });
  });

  describe("previewOverride", () => {
    test("returns projected state and wallet impact without writing anything", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => ({
          id: "b1",
          currentState: "confirmed",
          holdAmount: 100,
        })),
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
        ]),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.previewOverride({
        bookingId: "b1",
        category: "tutor_no_show",
        reason: "Preview",
        marksAction: "release_holds",
        affectedParticipants: ["u1"],
      });

      expect(result.bookingId).toBe("b1");
      expect(result.currentState).toBe("confirmed");
      expect(result.projectedState).toBe("no_show");
      expect(result.affectedParticipants).toEqual(["u1"]);
      expect(result.marksAction).toBe("release_holds");
      expect(result.perParticipantImpact).toHaveLength(1);
      expect(result.perParticipantImpact[0]).toMatchObject({
        userId: "u1",
        participantId: "p1",
        heldAmount: 50,
        walletId: "w1",
        action: "release_holds",
        before: { totalBalance: 200, heldBalance: 0, availableBalance: 200 },
        after: { totalBalance: 200, heldBalance: 0, availableBalance: 250 },
      });
      expect(repo.updateBookingWithOverride).not.toHaveBeenCalled();
      expect(repo.insertStateHistoryEntry).not.toHaveBeenCalled();
    });

    test("throws BookingNotFoundError for missing booking", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      try {
        await service.previewOverride({
          bookingId: "missing",
          category: "force_cancel",
          reason: "Preview",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(BookingNotFoundError);
      }
    });

    test("throws TerminalStateOverrideError for terminal booking", async () => {
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      try {
        await service.previewOverride({
          bookingId: "b1",
          category: "force_cancel",
          reason: "Preview",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(TerminalStateOverrideError);
      }
    });

    test("no marksAction returns empty impact and null marksAction", async () => {
      const repo = mockRepo();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.previewOverride({
        bookingId: "b1",
        category: "admin_correction",
        reason: "Preview",
      });
      expect(result.marksAction).toBeNull();
      expect(result.perParticipantImpact).toEqual([]);
    });
  });

  describe("applyOverride notifications", () => {
    test("F24: planOverride rejects an affectedParticipant that is not a booking participant", async () => {
      const repo = mockRepo({
        findBookingById: mock(async () => ({
          id: "b1",
          currentState: "confirmed",
          holdAmount: 100,
        })),
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
        ]),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      await expect(
        service.applyOverride("admin1", {
          bookingId: "b1",
          category: "tutor_no_show",
          reason: "Bad participant",
          marksAction: "release_holds",
          affectedParticipants: ["u1", "u999"],
        }),
      ).rejects.toThrow(OverrideParticipantNotInBookingError);
    });

    test("writes best-effort notification to affected participants", async () => {
      const notification = makeNotificationPort();
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
          { id: "p2", userId: "u2", heldAmount: 0 },
        ]),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        notification: notification as any,
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "force_cancel",
        reason: "Notify",
        affectedParticipants: ["u1", "u2"],
      });

      expect(notification.writeBestEffort).toHaveBeenCalledTimes(2);
      const first = notification.writeBestEffort.mock.calls[0][0];
      expect(first).toMatchObject({
        userId: "u1",
        bookingId: "b1",
        category: "override",
        severity: "action",
      });
      expect(first.eventKey).toBe("override.applied.b1.u1");
    });

    test("skips notifications when no port provided", async () => {
      const repo = mockRepo({
        findParticipantsByBookingId: mock(async () => [
          { id: "p1", userId: "u1", heldAmount: 50 },
        ]),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      await service.applyOverride("admin1", {
        bookingId: "b1",
        category: "force_cancel",
        reason: "No notify",
        affectedParticipants: ["u1"],
      });
      expect(repo.updateBookingWithOverride).toHaveBeenCalledTimes(1);
    });
  });

  describe("adminRefund notifications", () => {
    test("writes best-effort refund notification to the payer", async () => {
      const notification = makeNotificationPort();
      const service = createAdminBookingService({
        db: makeDb(),
        repo: mockRepo(),
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        notification: notification as any,
      });

      const result = await service.adminRefund("admin1", {
        paymentId: "pay1",
        reason: "Admin refund",
      });

      expect(result.status).toBe("refunded");
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      const params = notification.writeBestEffort.mock.calls[0][0];
      expect(params).toMatchObject({
        userId: "u1",
        category: "refund",
        severity: "action",
        emailRequired: true,
      });
      expect(params.eventKey).toBe("payment.pay1.refunded.admin");
    });

    test("skips notification when no port provided", async () => {
      const service = createAdminBookingService({
        db: makeDb(),
        repo: mockRepo(),
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.adminRefund("admin1", {
        paymentId: "pay1",
        reason: "Admin refund",
      });
      expect(result.status).toBe("refunded");
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ bookingId: "b1" });
      expect(result.items).toEqual([
        {
          ...booking,
          escalated: false,
          reportedAt: null,
          slaDeadline: null,
        },
      ]);
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ bookingId: "nonexistent" });
      expect(result.items).toEqual([]);
    });

    test("returns bookings with limit from repo", async () => {
      const bookings = [
        { id: "b1", currentState: "confirmed", scheduledStartAt: new Date() },
        { id: "b2", currentState: "pending", scheduledStartAt: new Date() },
        { id: "b3", currentState: "completed", scheduledStartAt: new Date() },
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ limit: 2 });
      expect(result.items).toEqual([
        {
          id: "b1",
          currentState: "confirmed",
          scheduledStartAt: expect.any(Date),
          escalated: false,
          reportedAt: null,
          slaDeadline: null,
        },
        {
          id: "b2",
          currentState: "pending",
          scheduledStartAt: expect.any(Date),
          escalated: false,
          reportedAt: null,
          slaDeadline: null,
        },
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
        { id: "b10", currentState: "confirmed", scheduledStartAt: new Date() },
        { id: "b11", currentState: "confirmed", scheduledStartAt: new Date() },
        { id: "b12", currentState: "confirmed", scheduledStartAt: new Date() },
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ limit: 2, cursor: "b9" });
      expect(repo.listBookingsByState).toHaveBeenCalledWith(
        expect.anything(),
        [],
        2,
        "b9",
      );
      expect(result.items).toEqual([
        {
          id: "b10",
          currentState: "confirmed",
          scheduledStartAt: expect.any(Date),
          escalated: false,
          reportedAt: null,
          slaDeadline: null,
        },
        {
          id: "b11",
          currentState: "confirmed",
          scheduledStartAt: expect.any(Date),
          escalated: false,
          reportedAt: null,
          slaDeadline: null,
        },
      ]);
    });

    test("passes category/urgency/escalated filters to repo as 5th arg", async () => {
      const repo = mockRepo({
        listBookingsByState: mock(async () => []),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      await service.listBookings({
        limit: 2,
        category: "force_cancel",
        urgency: "high",
        escalated: true,
      });
      expect(repo.listBookingsByState).toHaveBeenCalledWith(
        expect.anything(),
        [],
        100,
        undefined,
        { category: "force_cancel", urgency: "high", escalated: true },
      );
    });

    test("normalizes a #booking number search into a typed repo filter", async () => {
      const scheduledStartAt = new Date();
      const repo = mockRepo({
        listBookingsByState: mock(async () => [
          {
            id: "b12",
            bookingNumber: 12,
            currentState: "confirmed",
            scheduledStartAt,
          },
        ]),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ search: "#12", limit: 5 });

      expect(repo.listBookingsByState).toHaveBeenCalledWith(
        expect.anything(),
        [],
        5,
        undefined,
        {
          bookingNumber: 12,
          category: undefined,
          urgency: undefined,
          escalated: undefined,
        },
      );
      expect(result.items[0]?.bookingNumber).toBe(12);
    });

    test("returns no rows for an invalid booking number search", async () => {
      const repo = mockRepo();
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
      });

      const result = await service.listBookings({ search: "booking-12" });

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(repo.listBookingsByState).not.toHaveBeenCalled();
    });

    test("flags booking as escalated when overrideMeta.overriddenAt passes OQ-04 SLA", async () => {
      const stale = new Date(Date.now() - 13 * 3600_000).toISOString();
      const fresh = new Date().toISOString();
      const repo = mockRepo({
        listBookingsByState: mock(async () => [
          {
            id: "b1",
            currentState: "confirmed",
            scheduledStartAt: new Date(),
            overrideMeta: { overriddenAt: stale },
          },
          {
            id: "b2",
            currentState: "scheduled",
            scheduledStartAt: new Date(),
            overrideMeta: { overriddenAt: fresh },
          },
          {
            id: "b3",
            currentState: "confirmed",
            scheduledStartAt: new Date(),
            overrideMeta: null,
          },
        ]),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ limit: 5 });
      expect(result.items.map((i) => i.escalated)).toEqual([
        true,
        false,
        false,
      ]);
    });

    test("escalated=true fills the page across windows (bounded loop)", async () => {
      // First window: 100 rows (limit+1 => more rows behind), none escalated.
      // Second window: 20 rows, 12 of them escalated. The service must
      // advance the cursor and keep fetching until it can fill `limit`
      // escalated items.
      const stale = new Date(Date.now() - 13 * 3600_000).toISOString();
      const fresh = new Date().toISOString();
      const windowOne = Array.from({ length: 101 }, (_, i) => ({
        id: `b-w1-${i}`,
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + i * 60_000),
        overrideMeta: { overriddenAt: fresh },
      }));
      const windowTwo = Array.from({ length: 20 }, (_, i) => ({
        id: `b-w2-${i}`,
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + i * 60_000),
        overrideMeta:
          i < 10 ? { overriddenAt: stale } : { overriddenAt: fresh },
      }));

      const repo = mockRepo({
        listBookingsByState: mock(
          async (_db: any, _states: any, _limit: any, cursor?: string) => {
            if (cursor === undefined) return windowOne;
            return windowTwo;
          },
        ),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ escalated: true, limit: 10 });
      expect(result.items).toHaveLength(10);
      expect(result.items.every((i) => i.escalated)).toBe(true);
      // Two repo fetches: the first window yielded no escalated rows.
      expect(repo.listBookingsByState).toHaveBeenCalledTimes(2);
    });

    test("escalated=true never returns an empty page with a non-null cursor", async () => {
      // A full first window with zero escalated rows and MORE rows behind it
      // used to return items=[] + nextCursor (infinite empty page loop).
      const fresh = new Date().toISOString();
      const rows = Array.from({ length: 101 }, (_, i) => ({
        id: `b-plain-${i}`,
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + i * 60_000),
        overrideMeta: { overriddenAt: fresh },
      }));
      const repo = mockRepo({
        listBookingsByState: mock(async () => rows),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ escalated: true, limit: 10 });
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    test("escalated=true stops after the bounded window budget", async () => {
      // Escalated rows exist only 6 windows deep — beyond the budget — so the
      // loop must stop and return an empty page with no cursor (not spin).
      const stale = new Date(Date.now() - 13 * 3600_000).toISOString();
      const fresh = new Date().toISOString();
      let calls = 0;
      const repo = mockRepo({
        listBookingsByState: mock(async () => {
          calls++;
          return Array.from({ length: 101 }, (_, i) => ({
            id: `b-deep-${calls}-${i}`,
            currentState: "confirmed",
            scheduledStartAt: new Date(Date.now() + i * 60_000),
            overrideMeta:
              calls >= 6 ? { overriddenAt: stale } : { overriddenAt: fresh },
          }));
        }),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: makeWalletPort() as any,
        refund: makeRefundPort(),
        meeting: { setManualLink: mock(async () => ({}) as any) },
      });

      const result = await service.listBookings({ escalated: true, limit: 10 });
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(calls).toBeLessThanOrEqual(6);
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
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
        meeting: { setManualLink: mock(async () => ({}) as any) },
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

    test("rolls back the credit when the conditional status update fails (M6)", async () => {
      const wallet = makeWalletPort();
      const refund = makeRefundPort();
      const repo = mockRepo({
        updatePaymentStatusIfRefundable: mock(async () => null),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort: makeAuditPort(),
        wallet: wallet as any,
        refund,
      });

      await expect(
        service.adminRefund("admin1", {
          paymentId: "pay1",
          reason: "Race test",
        }),
      ).rejects.toThrow(InvalidRefundStateError);
      // Nothing after the guard may be recorded: no refund record, no audit.
      expect(refund.createRefundRecord).not.toHaveBeenCalled();
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
      expect(repo.updatePaymentStatusIfRefundable).toHaveBeenCalledWith(
        expect.anything(),
        "pay1",
      );
      expect(refund.createRefundRecord).toHaveBeenCalledWith(
        expect.anything(),
        {
          paymentId: "pay1",
          walletId: "w1",
          // N1: admin refunds are in-app Marks corrections — no cash moves,
          // so the refund record carries 0 IDR and no provider refund id.
          amountIdr: 0,
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
      expect(repo.updatePaymentStatusIfRefundable).toHaveBeenCalledWith(
        expect.anything(),
        "pay2",
      );
      expect(refund.createRefundRecord).toHaveBeenCalledWith(
        expect.anything(),
        {
          paymentId: "pay2",
          walletId: "w1",
          // N1: in-app Marks credit only — no cash moves.
          amountIdr: 0,
          marks: 75,
          reason: "Settled refund",
          actorId: "admin1",
        },
      );
      expect(auditPort.record).toHaveBeenCalledTimes(1);
    });

    test("never calls refund.refundWithProvider even when payment has a providerRequestId (N1)", async () => {
      const wallet = makeWalletPort();
      const auditPort = makeAuditPort();
      const refund = makeRefundPort();
      const refundWithProvider = mock(async () => ({
        providerRefundId: "rfd-stub-pr-stub",
      }));
      const refundPort = {
        ...refund,
        refundWithProvider,
      } as any;
      const repo = mockRepo({
        findPaymentById: mock(async () => ({
          id: "pay1",
          userId: "u1",
          status: "PAID",
          marks: 50,
          amountIdr: 100000,
          providerRequestId: "pr-stub-123",
        })),
      });
      const service = createAdminBookingService({
        db: makeDb(),
        repo,
        auditPort,
        wallet: wallet as any,
        refund: refundPort,
      });

      const result = await service.adminRefund("admin1", {
        paymentId: "pay1",
        reason: "N1 test",
      });

      expect(result).toEqual({ paymentId: "pay1", status: "refunded" });
      // N1: admin refunds are in-app Marks credits only — the provider must
      // never be called, and no cash moves on the refund record.
      expect(refundWithProvider).not.toHaveBeenCalled();
      expect(refund.createRefundRecord).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountIdr: 0 }),
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

    test("F11: rejects the spent payment and refunds the unspent one (per-payment FIFO attribution)", async () => {
      // P1(100) and P2(100) were both credited; 100 Marks were spent and the
      // wallet holds 100 (P2's credit). FIFO attributes the spend to P1, so:
      //   - refunding P1 must reject (P1's own Marks are gone)
      //   - refunding P2 must succeed (P2's Marks were never spent)
      const payments = [
        { id: "pay1", userId: "u1", status: "PAID", marks: 100 },
        { id: "pay2", userId: "u1", status: "PAID", marks: 100 },
      ];
      const wallet = makeWalletPort({
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 0,
          availableBalance: 100,
        })),
        sumCreditedMarks: mock(async () => 200),
        compensate: mock(async () => ({
          id: "w1",
          totalBalance: 150,
          heldBalance: 0,
          availableBalance: 150,
        })),
      });
      const repo = mockRepo({
        listCreditStatePaymentsForUser: mock(async () => payments),
      });

      const serviceFor = (paymentId: string) =>
        createAdminBookingService({
          db: makeDb(),
          repo: {
            ...repo,
            findPaymentById: mock(async () =>
              payments.find((p) => p.id === paymentId),
            ),
          },
          auditPort: makeAuditPort(),
          wallet: wallet as any,
          refund: makeRefundPort(),
        });

      // P1 (earliest) was fully spent — rejected.
      await expect(
        serviceFor("pay1").adminRefund("admin1", {
          paymentId: "pay1",
          reason: "F11 spent",
        }),
      ).rejects.toThrow(RefundSpendExhaustedError);

      // P2 (unspent) refunds its full 100.
      const result = await serviceFor("pay2").adminRefund("admin1", {
        paymentId: "pay2",
        reason: "F11 unspent",
      });
      expect(result).toEqual({ paymentId: "pay2", status: "refunded" });
      expect(wallet.compensate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          walletId: "w1",
          amount: 100,
          eventKey: "refund.pay2",
          sourceReference: "pay2",
        }),
      );
    });
  });
});

describe("AdminBookingService additional guards", () => {
  test("setMeetingLink rejects when the meeting port is not configured", async () => {
    const service = createAdminBookingService({
      db: makeDb(),
      repo: mockRepo({
        findBookingById: mock(async () => ({
          id: "b1",
          currentState: "confirmed",
          modality: "online",
        })),
      }),
      auditPort: makeAuditPort(),
      wallet: makeWalletPort() as any,
      refund: makeRefundPort(),
    });

    await expect(
      service.setMeetingLink("admin1", {
        bookingId: "b1",
        url: "https://meet.example.com/manual",
      }),
    ).rejects.toThrow("Meeting port not configured");
  });

  test("F10: setMeetingLink passes the booking transaction to the meeting port", async () => {
    const setManualLink = mock(async () => ({
      id: "me1",
      bookingId: "b1",
      provider: "manual",
      status: "created",
      meetingUrl: "https://meet.example.com/manual",
      externalEventId: null,
      errorReason: null,
    }));
    const meeting = { setManualLink };
    const db = makeDb();
    const service = createAdminBookingService({
      db,
      repo: mockRepo({
        findBookingById: mock(async () => ({
          id: "b1",
          currentState: "confirmed",
          modality: "online",
        })),
      }),
      auditPort: makeAuditPort(),
      wallet: makeWalletPort() as any,
      refund: makeRefundPort(),
      notification: makeNotificationPort(),
      meeting,
    });

    await service.setMeetingLink("admin1", {
      bookingId: "b1",
      url: "https://meet.example.com/manual",
    });

    expect(setManualLink).toHaveBeenCalledTimes(1);
    // The tx object is passed as the third arg — the row commits/rolls back
    // with the booking transaction (F10, no orphan row on rollback).
    const args = setManualLink.mock.calls[0] as unknown[];
    expect(args[0]).toBe("b1");
    expect(args[1]).toBe("https://meet.example.com/manual");
    expect(args[2]).toBeDefined();
  });

  test("setMeetingLink rejects offline bookings", async () => {
    const setManualLink = mock(async () => ({}) as any);
    const service = createAdminBookingService({
      db: makeDb(),
      repo: mockRepo({
        findBookingById: mock(async () => ({
          id: "b1",
          currentState: "scheduled",
          modality: "offline",
        })),
      }),
      auditPort: makeAuditPort(),
      wallet: makeWalletPort() as any,
      refund: makeRefundPort(),
      meeting: { setManualLink, cancelEvent: mock(async () => {}) },
    });

    await expect(
      service.setMeetingLink("admin1", {
        bookingId: "b1",
        url: "https://meet.example.com/offline",
      }),
    ).rejects.toThrow("online bookings");
    expect(setManualLink).not.toHaveBeenCalled();
  });

  test("cancelSeriesSession rejects a session that is no longer scheduled", async () => {
    const service = createAdminBookingService({
      db: makeDb(),
      repo: mockRepo({
        findSessionById: mock(async () => ({
          id: "s1",
          seriesBookingId: "b1",
          currentState: "completed",
          holdAmount: 50,
        })),
      }),
      auditPort: makeAuditPort(),
      wallet: makeWalletPort() as any,
      refund: makeRefundPort(),
    });

    await expect(
      service.cancelSeriesSession("admin1", {
        sessionId: "s1",
        marksAction: "release",
      }),
    ).rejects.toThrow(BookingStateTransitionError);
  });
});
