import { describe, test, expect, mock } from "bun:test";

import { createWalletHandler } from "../../modules/wallet/wallet.handler";

const walletService = {
  getOrCreate: mock(async () => ({
    id: "w1",
    totalBalance: 1000,
    heldBalance: 200,
    availableBalance: 800,
  })),
  listLedger: mock(async () => ({ items: [] })),
  listActivePackages: mock(async () => [{ id: "pkg1" }]),
  knowledgeBankEligible: mock(async () => ({
    eligible: true,
    balance: 40,
    threshold: 35,
  })),
};

const walletHandler = createWalletHandler({
  wallet: walletService as any,
  competitionCalendarUrl: "https://example.com/calendar",
});

describe("walletHandler", () => {
  describe("get", () => {
    test("calls wallet.getOrCreate and returns transformed wallet", async () => {
      const context = {
        session: { user: { id: "u1" } },
      };

      const result = await walletHandler.get({ context } as any);

      expect(walletService.getOrCreate).toHaveBeenCalledWith("u1");
      expect(result).toEqual({
        id: "w1",
        totalBalance: 1000,
        heldBalance: 200,
        availableBalance: 800,
      });
    });
  });

  describe("listLedger", () => {
    test("calls wallet.getOrCreate then wallet.listLedger with wallet id and input", async () => {
      const result = await walletHandler.listLedger({
        context: { session: { user: { id: "u1" } } } as any,
        input: { limit: 10 },
      });

      expect(walletService.getOrCreate).toHaveBeenCalledWith("u1");
      expect(walletService.listLedger).toHaveBeenCalledWith("w1", {
        limit: 10,
      });
      expect(result).toEqual({ items: [] });
    });
  });

  describe("listPackages", () => {
    test("calls wallet.listActivePackages", async () => {
      const result = await walletHandler.listPackages({
        context: { session: { user: { id: "u1" } } },
      } as any);

      expect(walletService.listActivePackages).toHaveBeenCalledWith();
      expect(result).toEqual([{ id: "pkg1" }]);
    });
  });

  describe("knowledgeBankEligible", () => {
    test("calls wallet.knowledgeBankEligible with session user id", async () => {
      const context = {
        session: { user: { id: "u1" } },
      };

      const result = await walletHandler.knowledgeBankEligible({
        context,
      } as any);

      expect(walletService.knowledgeBankEligible).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ eligible: true, balance: 40, threshold: 35 });
    });
  });

  describe("competitionCalendarLink", () => {
    test("returns url from env.COMPETITION_CALENDAR_URL", async () => {
      const result = await walletHandler.competitionCalendarLink();

      expect(result).toEqual({ url: "https://example.com/calendar" });
    });
  });
});
