import { describe, test, expect, mock } from "bun:test";
import { createRefundService } from "../../modules/refund/refund.service";
import { WalletNotFoundError } from "../../modules/refund/refund.errors";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      return fn({
        ...makeDb(),
      });
    }),
  } as any;
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    insertRefundRecord: mock(async () => ({})),
    findPaymentByReference: mock(async () => null),
    updatePaymentStatus: mock(async () => null),
    ...overrides,
  };
}

function makeWalletPort() {
  return {
    getById: mock(async () => ({
      id: "w1",
      totalBalance: 100,
      heldBalance: 0,
      availableBalance: 100,
    })),
    compensate: mock(async () => ({
      id: "w1",
      totalBalance: 150,
      heldBalance: 0,
      availableBalance: 150,
    })),
    listLedger: mock(async () => ({
      items: [],
      nextCursor: null,
    })),
  };
}

function makeAuditPort() {
  return { record: mock(async () => {}) };
}

describe("RefundService", () => {
  describe("createCorrection", () => {
    test("throws error when wallet not found", async () => {
      const service = createRefundService({
        db: makeDb(),
        repo: makeRepo(),
        wallet: {
          ...makeWalletPort(),
          getById: mock(async () => null),
        } as any,
        auditPort: makeAuditPort() as any,
      });

      try {
        await service.createCorrection("admin1", {
          walletId: "nonexistent",
          amount: 50,
          type: "compensate_credit",
          reason: "Test correction",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(WalletNotFoundError);
      }
    });

    test("creates a credit correction successfully", async () => {
      const repo = makeRepo();
      const wallet = makeWalletPort();
      const audit = makeAuditPort();
      const service = createRefundService({
        db: makeDb(),
        repo,
        wallet: wallet as any,
        auditPort: audit as any,
      });

      const result = await service.createCorrection("admin1", {
        walletId: "w1",
        amount: 50,
        type: "compensate_credit",
        reason: "Admin credit correction",
      });

      expect(result.walletId).toBe("w1");
      expect(result.type).toBe("compensate_credit");
      expect(result.amount).toBe(50);
    });

    test("creates a deduct correction successfully", async () => {
      const repo = makeRepo();
      const wallet = makeWalletPort();
      const audit = makeAuditPort();
      const service = createRefundService({
        db: makeDb(),
        repo,
        wallet: wallet as any,
        auditPort: audit as any,
      });

      const result = await service.createCorrection("admin1", {
        walletId: "w1",
        amount: 30,
        type: "compensate_deduct",
        reason: "Admin deduction",
      });

      expect(result.walletId).toBe("w1");
      expect(result.type).toBe("compensate_deduct");
    });

    test("passes null paymentId when no bookingId provided", async () => {
      const repo = makeRepo();
      const wallet = makeWalletPort();
      const service = createRefundService({
        db: makeDb(),
        repo,
        wallet: wallet as any,
        auditPort: makeAuditPort() as any,
      });

      await service.createCorrection("admin1", {
        walletId: "w1",
        amount: 50,
        type: "compensate_credit",
        reason: "No booking ref",
      });

      const call = repo.insertRefundRecord.mock.calls[0];
      expect(call[1].paymentId).toBeNull();
    });

    test("passes null paymentId regardless of bookingId", async () => {
      const repo = makeRepo();
      const wallet = makeWalletPort();
      const service = createRefundService({
        db: makeDb(),
        repo,
        wallet: wallet as any,
        auditPort: makeAuditPort() as any,
      });

      await service.createCorrection("admin1", {
        walletId: "w1",
        amount: 50,
        type: "compensate_credit",
        reason: "Booking correction",
        bookingId: "b123",
      });

      const call = repo.insertRefundRecord.mock.calls[0];
      expect(call[1].paymentId).toBeNull();
    });
  });

  describe("listCorrections", () => {
    test("passes the compensate filter to listLedger and returns its items", async () => {
      const wallet = {
        ...makeWalletPort(),
        listLedger: mock(async () => ({
          items: [
            { entryType: "compensate_credit", id: "1" },
            { entryType: "compensate_deduct", id: "3" },
          ],
          nextCursor: null,
        })),
      };
      const service = createRefundService({
        db: makeDb(),
        repo: makeRepo(),
        wallet: wallet as any,
        auditPort: makeAuditPort() as any,
      });

      const result = await service.listCorrections({ walletId: "w1" });
      expect(result.items.length).toBe(2);
      expect(wallet.listLedger).toHaveBeenCalledWith(
        "w1",
        expect.objectContaining({
          entryType: ["compensate_credit", "compensate_deduct"],
        }),
      );
    });

    test("applies the default limit as limit + 1 for cursor detection", async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        entryType: "compensate_credit",
        id: String(i),
      }));
      const wallet = {
        ...makeWalletPort(),
        listLedger: mock(async () => ({
          items,
          nextCursor: "cursor1",
        })),
      };
      const service = createRefundService({
        db: makeDb(),
        repo: makeRepo(),
        wallet: wallet as any,
        auditPort: makeAuditPort() as any,
      });

      const result = await service.listCorrections({ walletId: "w1" });
      expect(result.nextCursor).toBe("cursor1");
      expect(wallet.listLedger).toHaveBeenCalledWith(
        "w1",
        expect.objectContaining({ limit: 21 }),
      );
    });

    test("passes cursor to listLedger", async () => {
      const wallet = {
        ...makeWalletPort(),
        listLedger: mock(async () => ({
          items: [],
          nextCursor: null,
        })),
      };
      const service = createRefundService({
        db: makeDb(),
        repo: makeRepo(),
        wallet: wallet as any,
        auditPort: makeAuditPort() as any,
      });

      await service.listCorrections({ walletId: "w1", cursor: "abc" });
      expect(wallet.listLedger).toHaveBeenCalledWith(
        "w1",
        expect.objectContaining({ cursor: "abc" }),
      );
    });
  });

  describe("createRefundRecord", () => {
    test("delegates to repo.insertRefundRecord", async () => {
      const repo = makeRepo();
      const service = createRefundService({
        db: makeDb(),
        repo,
        wallet: makeWalletPort() as any,
        auditPort: makeAuditPort() as any,
      });

      await service.createRefundRecord({} as any, {
        paymentId: "pay1",
        walletId: "w1",
        amountIdr: 50000,
        marks: 100,
        reason: "refund",
        actorId: "admin1",
      });

      expect(repo.insertRefundRecord).toHaveBeenCalledTimes(1);
      const call = repo.insertRefundRecord.mock.calls[0];
      expect(call[1].paymentId).toBe("pay1");
      expect(call[1].walletId).toBe("w1");
    });
  });
});
