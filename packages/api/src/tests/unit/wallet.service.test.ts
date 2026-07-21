import { describe, test, expect, mock } from "bun:test";
import { createWalletService } from "../../modules/wallet/wallet.service";

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
    getOrCreate: mock(async () => wallet),
    atomicHold: mock(async () => ({
      ...wallet,
      heldBalance: wallet.heldBalance + 10,
      availableBalance: wallet.availableBalance - 10,
    })),
    atomicRelease: mock(async () => ({
      ...wallet,
      heldBalance: wallet.heldBalance - 10,
      availableBalance: wallet.availableBalance + 10,
    })),
    atomicDeduct: mock(async () => ({
      ...wallet,
      totalBalance: wallet.totalBalance - 10,
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
      ...wallet,
      totalBalance: wallet.totalBalance - 10,
    })),
    insertLedger: mock(async () => {}),
    listLedger: mock(async () => ({ items: [], nextCursor: null })),
    listActivePackages: mock(async () => []),
    ...overrides,
  };
}

function makeDb() {
  return {} as any;
}

describe("WalletService", () => {
  describe("hold", () => {
    test("throws notFound when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.hold(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "hold.1",
          actorType: "system",
        }),
      ).rejects.toThrow("Wallet not found");
    });

    test("throws badRequest when insufficient balance", async () => {
      const repo = makeRepo({
        getById: mock(async () => makeWallet({ availableBalance: 5 })),
      });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.hold(makeDb(), {
          walletId: "wallet1",
          amount: 50,
          eventKey: "hold.1",
          actorType: "system",
        }),
      ).rejects.toThrow("Insufficient available balance");
    });

    test("holds funds and inserts ledger entry", async () => {
      const updated = makeWallet({ heldBalance: 30, availableBalance: 70 });
      const repo = makeRepo({ atomicHold: mock(async () => updated) });
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
    test("throws notFound when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.release(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "release.1",
          actorType: "system",
        }),
      ).rejects.toThrow("Wallet not found");
    });

    test("releases funds and inserts ledger entry", async () => {
      const updated = makeWallet({ heldBalance: 10, availableBalance: 90 });
      const repo = makeRepo({ atomicRelease: mock(async () => updated) });
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
    test("throws notFound when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.deduct(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "deduct.1",
          actorType: "system",
        }),
      ).rejects.toThrow("Wallet not found");
    });

    test("deducts funds and inserts ledger entry", async () => {
      const updated = makeWallet({ totalBalance: 90 });
      const repo = makeRepo({ atomicDeduct: mock(async () => updated) });
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
    test("throws notFound when wallet not found", async () => {
      const repo = makeRepo({ getById: mock(async () => null) });
      const service = createWalletService(repo as any, makeDb());
      await expect(
        service.credit(makeDb(), {
          walletId: "missing",
          amount: 10,
          eventKey: "credit.1",
          actorType: "system",
        }),
      ).rejects.toThrow("Wallet not found");
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
    test("throws notFound when wallet not found", async () => {
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
      ).rejects.toThrow("Wallet not found");
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
        atomicCompensateDeduct: mock(async () => updated),
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
    test("delegates to repo", async () => {
      const wallet = makeWallet();
      const repo = makeRepo({ getOrCreate: mock(async () => wallet) });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.getOrCreate("user1");
      expect(result).toEqual(wallet);
      expect(repo.getOrCreate).toHaveBeenCalledWith("user1");
    });
  });

  describe("listLedger", () => {
    test("delegates to repo with db instance", async () => {
      const db = makeDb();
      const repo = makeRepo();
      const service = createWalletService(repo as any, db);

      await service.listLedger("wallet1");
      expect(repo.listLedger).toHaveBeenCalledWith(db, "wallet1", undefined);
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
        getByUserId: mock(async () => makeWallet({ availableBalance: 20 })),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.knowledgeBankEligible("user1");
      expect(result.eligible).toBe(false);
      expect(result.balance).toBe(20);
    });

    test("returns eligible when balance meets threshold", async () => {
      const repo = makeRepo({
        getByUserId: mock(async () => makeWallet({ availableBalance: 50 })),
      });
      const service = createWalletService(repo as any, makeDb());

      const result = await service.knowledgeBankEligible("user1");
      expect(result.eligible).toBe(true);
      expect(result.balance).toBe(50);
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
});
