import { describe, test, expect, mock } from "bun:test";
import { createWalletService } from "../../modules/wallet/wallet.service";
import {
  WalletNotFoundError,
  InsufficientBalanceError,
} from "../../modules/wallet/wallet.errors";
import type { AtomicResult } from "../../modules/wallet/wallet.repo";

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: "wallet1",
    totalBalance: 100,
    heldBalance: 20,
    availableBalance: 80,
    ...overrides,
  };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  const wallet = makeWallet();
  return {
    getById: mock(async () => wallet),
    getByUserId: mock(async () => wallet),
    upsert: mock(async () => wallet),
    atomicHold: mock(async () => ({
      success: true as const,
      wallet: {
        ...wallet,
        heldBalance: wallet.heldBalance + 10,
        availableBalance: wallet.availableBalance - 10,
      },
    })),
    atomicRelease: mock(async () => ({
      success: true,
      wallet: {
        ...wallet,
        heldBalance: wallet.heldBalance - 10,
        availableBalance: wallet.availableBalance + 10,
      },
    })),
    atomicDeduct: mock(async () => ({
      success: true as const,
      wallet: { ...wallet, totalBalance: wallet.totalBalance - 10 },
    })),
    atomicCredit: mock(async () => ({
      ...wallet,
      totalBalance: wallet.totalBalance + 10,
    })),
    atomicCompensateCredit: mock(async () => ({
      ...wallet,
      totalBalance: wallet.totalBalance + 10,
    })),
    atomicCompensateDeduct: mock(async () => ({
      success: true,
      wallet: {
        ...wallet,
        totalBalance: wallet.totalBalance - 10,
      },
    })),
    insertLedger: mock(async () => {}),
    findLedgerEntries: mock(async () => []),
    listActivePackages: mock(async () => []),
    ...overrides,
  };
}

function makeDb() {
  return {} as any;
}

describe("WalletService", () => {
  describe("hold", () => {
    test("throws WalletNotFoundError when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.hold(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "hold.1",
          actorType: "system",
        }),
      ).rejects.toThrow(WalletNotFoundError);
    });

    test("throws InsufficientBalanceError when atomicHold fails", async () => {
      const repo = makeRepo({
        getById: mock(async () => makeWallet({ availableBalance: 5 })),
        atomicHold: mock(async (): Promise<AtomicResult> => ({
          success: false,
          reason: "insufficient_balance",
        })),
      });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.hold(makeDb(), {
          walletId: "wallet1",
          amount: 50,
          eventKey: "hold.1",
          actorType: "system",
        }),
      ).rejects.toThrow(InsufficientBalanceError);
    });

    test("holds funds and inserts ledger entry", async () => {
      const updated = makeWallet({ heldBalance: 30, availableBalance: 70 });
      const repo = makeRepo({
        atomicHold: mock(async () => ({ success: true, wallet: updated })),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.hold(makeDb(), {
        walletId: "wallet1",
        amount: 10,
        eventKey: "hold.1",
        actorType: "system",
      });

      expect(result).toEqual(updated);
      expect(repo.atomicHold).toHaveBeenCalledTimes(1);
      expect(repo.insertLedger).toHaveBeenCalledTimes(1);
    });
  });

  describe("release", () => {
    test("throws WalletNotFoundError when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.release(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "release.1",
          actorType: "system",
        }),
      ).rejects.toThrow(WalletNotFoundError);
    });

    test("releases funds and inserts ledger entry", async () => {
      const updated = makeWallet({ heldBalance: 10, availableBalance: 90 });
      const repo = makeRepo({
        atomicRelease: mock(async () => ({ success: true, wallet: updated })),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.release(makeDb(), {
        walletId: "wallet1",
        amount: 10,
        eventKey: "release.1",
        actorType: "system",
      });

      expect(result).toEqual(updated);
      expect(repo.atomicRelease).toHaveBeenCalledTimes(1);
      expect(repo.insertLedger).toHaveBeenCalledTimes(1);
    });
  });

  describe("deduct", () => {
    test("throws WalletNotFoundError when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.deduct(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "deduct.1",
          actorType: "system",
        }),
      ).rejects.toThrow(WalletNotFoundError);
    });

    test("throws InsufficientBalanceError when atomicDeduct fails", async () => {
      const repo = makeRepo({
        atomicDeduct: mock(async (): Promise<AtomicResult> => ({
          success: false,
          reason: "insufficient_held",
        })),
      });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.deduct(makeDb(), {
          walletId: "wallet1",
          amount: 50,
          eventKey: "deduct.1",
          actorType: "system",
        }),
      ).rejects.toThrow(InsufficientBalanceError);
    });

    test("deducts funds and inserts ledger entry", async () => {
      const updated = makeWallet({ totalBalance: 90 });
      const repo = makeRepo({
        atomicDeduct: mock(async () => ({ success: true, wallet: updated })),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.deduct(makeDb(), {
        walletId: "wallet1",
        amount: 10,
        eventKey: "deduct.1",
        actorType: "system",
      });

      expect(result).toEqual(updated);
      expect(repo.insertLedger).toHaveBeenCalledTimes(1);
    });
  });

  describe("credit", () => {
    test("throws WalletNotFoundError when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.credit(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "credit.1",
          actorType: "system",
        }),
      ).rejects.toThrow(WalletNotFoundError);
    });

    test("credits funds and inserts ledger entry", async () => {
      const updated = makeWallet({ totalBalance: 110 });
      const repo = makeRepo({ atomicCredit: mock(async () => updated) });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.credit(makeDb(), {
        walletId: "wallet1",
        amount: 10,
        eventKey: "credit.1",
        actorType: "system",
      });

      expect(result).toEqual(updated);
      expect(repo.insertLedger).toHaveBeenCalledTimes(1);
    });
  });

  describe("compensate", () => {
    test("throws WalletNotFoundError when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.compensate(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "comp.1",
          actorType: "system",
          type: "compensate_credit",
        }),
      ).rejects.toThrow(WalletNotFoundError);
    });

    test("compensate_credit calls atomicCompensateCredit", async () => {
      const updated = makeWallet({ totalBalance: 110 });
      const repo = makeRepo({
        atomicCompensateCredit: mock(async () => updated),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.compensate(makeDb(), {
        walletId: "wallet1",
        amount: 10,
        eventKey: "comp.1",
        actorType: "system",
        type: "compensate_credit",
      });

      expect(result).toEqual(updated);
      expect(repo.atomicCompensateCredit).toHaveBeenCalledTimes(1);
      expect(repo.insertLedger).toHaveBeenCalledTimes(1);
    });

    test("compensate_deduct calls atomicCompensateDeduct", async () => {
      const updated = makeWallet({ totalBalance: 90 });
      const repo = makeRepo({
        atomicCompensateDeduct: mock(async () => ({
          success: true,
          wallet: updated,
        })),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.compensate(makeDb(), {
        walletId: "wallet1",
        amount: 10,
        eventKey: "comp.2",
        actorType: "system",
        type: "compensate_deduct",
      });

      expect(result).toEqual(updated);
      expect(repo.atomicCompensateDeduct).toHaveBeenCalledTimes(1);
      expect(repo.insertLedger).toHaveBeenCalledTimes(1);
    });
  });

  describe("getById", () => {
    test("delegates to repo", async () => {
      const wallet = makeWallet();
      const repo = makeRepo({ getById: mock(async () => wallet) });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.getById(makeDb(), "wallet1");
      expect(result).toEqual(wallet);
      expect(repo.getById).toHaveBeenCalledWith(makeDb(), "wallet1");
    });
  });

  describe("getByUserId", () => {
    test("delegates to repo", async () => {
      const wallet = makeWallet();
      const repo = makeRepo({ getByUserId: mock(async () => wallet) });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.getByUserId(makeDb(), "user1");
      expect(result).toEqual(wallet);
      expect(repo.getByUserId).toHaveBeenCalledWith(makeDb(), "user1");
    });
  });

  describe("getOrCreate", () => {
    test("returns existing wallet when found", async () => {
      const existing = makeWallet();
      const repo = makeRepo({ getByUserId: mock(async () => existing) });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.getOrCreate("user1");
      expect(result).toEqual(existing);
      expect(repo.getByUserId).toHaveBeenCalledWith(makeDb(), "user1");
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    test("creates new wallet via upsert when not found", async () => {
      const created = makeWallet();
      const repo = makeRepo({
        getByUserId: mock(async () => null),
        upsert: mock(async () => created),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.getOrCreate("user1");
      expect(result).toEqual(created);
      expect(repo.upsert).toHaveBeenCalledWith(makeDb(), {
        userId: "user1",
        totalBalance: 0,
        heldBalance: 0,
        availableBalance: 0,
      });
    });

    test("re-fetches when upsert returns null (conflict case)", async () => {
      const afterConflict = makeWallet();
      const repo = makeRepo({
        getByUserId: mock(async () => null)
          .mockImplementationOnce(async () => null)
          .mockImplementationOnce(async () => afterConflict),
        upsert: mock(async () => null),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.getOrCreate("user1");
      expect(result).toEqual(afterConflict);
      expect(repo.getByUserId).toHaveBeenCalledTimes(2);
    });

    test("throws WalletNotFoundError when upsert returns null and re-fetch fails", async () => {
      const repo = makeRepo({
        getByUserId: mock(async () => null),
        upsert: mock(async () => null),
      });
      const service = createWalletService(repo as any, makeDb());

      await expect(service.getOrCreate("user1")).rejects.toThrow(
        WalletNotFoundError,
      );
    });
  });

  describe("listLedger", () => {
    test("computes pagination from findLedgerEntries results", async () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: `l${i}`,
        walletId: "w1",
      }));
      const db = makeDb();
      const repo = makeRepo({
        findLedgerEntries: mock(async () => rows),
      });
      const service = createWalletService(repo as any, db);

      const result = await service.listLedger("w1", { limit: 20 });
      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe("l19");
      expect(repo.findLedgerEntries).toHaveBeenCalledWith(db, "w1", {
        limit: 20,
        cursor: undefined,
        bookingId: undefined,
        eventKey: undefined,
      });
    });

    test("returns null nextCursor when no more rows", async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        id: `l${i}`,
        walletId: "w1",
      }));
      const db = makeDb();
      const repo = makeRepo({
        findLedgerEntries: mock(async () => rows),
      });
      const service = createWalletService(repo as any, db);

      const result = await service.listLedger("w1", { limit: 20 });
      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).toBeNull();
    });

    test("uses default limit of 20", async () => {
      const db = makeDb();
      const repo = makeRepo({
        findLedgerEntries: mock(async () => []),
      });
      const service = createWalletService(repo as any, db);

      await service.listLedger("w1");
      expect(repo.findLedgerEntries).toHaveBeenCalledWith(db, "w1", {
        limit: 20,
        cursor: undefined,
        bookingId: undefined,
        eventKey: undefined,
      });
    });

    test("caps limit at 100", async () => {
      const db = makeDb();
      const repo = makeRepo({
        findLedgerEntries: mock(async () => []),
      });
      const service = createWalletService(repo as any, db);

      await service.listLedger("w1", { limit: 200 });
      expect(repo.findLedgerEntries).toHaveBeenCalledWith(db, "w1", {
        limit: 100,
        cursor: undefined,
        bookingId: undefined,
        eventKey: undefined,
      });
    });
  });

  describe("knowledgeBankEligible", () => {
    test("returns not eligible when wallet not found", async () => {
      const repo = makeRepo({ getByUserId: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.knowledgeBankEligible("user1");
      expect(result).toEqual({
        eligible: false,
        balance: 0,
        threshold: 35,
      });
    });

    test("returns not eligible when balance below threshold", async () => {
      const repo = makeRepo({
        getByUserId: mock(async () =>
          makeWallet({
            totalBalance: 20,
            heldBalance: 10,
            availableBalance: 10,
          }),
        ),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.knowledgeBankEligible("user1");
      expect(result.eligible).toBe(false);
      expect(result.balance).toBe(20);
    });

    test("returns eligible when balance meets threshold", async () => {
      const repo = makeRepo({
        getByUserId: mock(async () =>
          makeWallet({
            totalBalance: 50,
            heldBalance: 20,
            availableBalance: 30,
          }),
        ),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.knowledgeBankEligible("user1");
      expect(result.eligible).toBe(true);
      expect(result.balance).toBe(50);
    });

    test("uses total balance, not available balance, for eligibility (U13)", async () => {
      const repo = makeRepo({
        getByUserId: mock(async () =>
          makeWallet({
            totalBalance: 40,
            heldBalance: 10,
            availableBalance: 30,
          }),
        ),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.knowledgeBankEligible("user1");
      expect(result.eligible).toBe(true);
      expect(result.balance).toBe(40);
    });
  });

  describe("listActivePackages", () => {
    test("delegates to repo", async () => {
      const db = makeDb();
      const packages = [
        {
          id: "pkg1",
          code: "starter",
          name: "Starter",
          marks: 35,
          priceIdr: 35000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const repo = makeRepo({ listActivePackages: mock(async () => packages) });
      const service = createWalletService(repo as any, db);

      const result = await service.listActivePackages();
      expect(result).toEqual(packages);
      expect(repo.listActivePackages).toHaveBeenCalledWith(db);
    });
  });

  describe("atomicity (D1)", () => {
    test("hold rolls back when insertLedger throws (db.transaction propagates)", async () => {
      const wallet = makeWallet();
      const updated = makeWallet({ heldBalance: 30, availableBalance: 70 });
      let txCommitted = false;
      const txClient = {
        getById: mock(async () => wallet),
        atomicHold: mock(async () => ({ success: true, wallet: updated })),
        insertLedger: mock(async () => {
          throw new Error("ledger insert failed");
        }),
      };
      const db = {
        transaction: mock(async (fn: any) => {
          await fn(txClient);
          txCommitted = true;
        }),
      } as any;

      const repo = {
        getById: txClient.getById,
        atomicHold: txClient.atomicHold,
        insertLedger: txClient.insertLedger,
      } as any;

      const service = createWalletService(repo, db);

      await expect(
        service.hold(db, {
          walletId: "wallet1",
          amount: 10,
          eventKey: "hold.1",
          actorType: "system",
        }),
      ).rejects.toThrow("ledger insert failed");

      expect(txClient.atomicHold).toHaveBeenCalledTimes(1);
      expect(txClient.insertLedger).toHaveBeenCalledTimes(1);
      expect(txCommitted).toBe(false);
    });

    test("credit rolls back when insertLedger throws", async () => {
      const wallet = makeWallet();
      const updated = makeWallet({ totalBalance: 110 });
      let txCommitted = false;
      const txClient = {
        getById: mock(async () => wallet),
        atomicCredit: mock(async () => updated),
        insertLedger: mock(async () => {
          throw new Error("ledger insert failed");
        }),
      };
      const db = {
        transaction: mock(async (fn: any) => {
          await fn(txClient);
          txCommitted = true;
        }),
      } as any;

      const repo = {
        getById: txClient.getById,
        atomicCredit: txClient.atomicCredit,
        insertLedger: txClient.insertLedger,
      } as any;

      const service = createWalletService(repo, db);

      await expect(
        service.credit(db, {
          walletId: "wallet1",
          amount: 10,
          eventKey: "credit.1",
          actorType: "system",
        }),
      ).rejects.toThrow("ledger insert failed");

      expect(txClient.insertLedger).toHaveBeenCalledTimes(1);
      expect(txCommitted).toBe(false);
    });

    test("hold uses passed-in tx directly when conn !== db (nested tx)", async () => {
      const wallet = makeWallet();
      const updated = makeWallet({ heldBalance: 30, availableBalance: 70 });
      const outerTx = {
        getById: mock(async () => wallet),
        atomicHold: mock(async () => ({ success: true, wallet: updated })),
        insertLedger: mock(async () => {}),
      };
      const db = { transaction: mock(async () => {}) } as any;

      const repo = {
        getById: outerTx.getById,
        atomicHold: outerTx.atomicHold,
        insertLedger: outerTx.insertLedger,
      } as any;

      const service = createWalletService(repo, db);

      const result = await service.hold(outerTx as any, {
        walletId: "wallet1",
        amount: 10,
        eventKey: "hold.1",
        actorType: "system",
      });

      expect(result).toEqual(updated);
      expect(db.transaction).not.toHaveBeenCalled();
      expect(outerTx.atomicHold).toHaveBeenCalledWith(outerTx, "wallet1", 10);
    });
  });
});
