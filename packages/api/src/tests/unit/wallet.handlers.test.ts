import { describe, test, expect, mock } from "bun:test";

mock.module("@cogito-app/env/server", () => ({
  env: {
    COMPETITION_CALENDAR_URL: "https://example.com/calendar",
  },
}));

const { walletHandlers } = await import("../../modules/wallet/wallet.handlers");

describe("walletHandlers", () => {
  describe("get", () => {
    test("calls wallet.getOrCreate and returns transformed wallet", async () => {
      const walletData = {
        id: "w1",
        totalBalance: 1000,
        heldBalance: 200,
        availableBalance: 800,
      };
      const getOrCreate = mock(async () => walletData);
      const context = {
        session: { user: { id: "u1" } },
        services: { wallet: { getOrCreate } },
      };

      const result = await walletHandlers.get({ context });

      expect(getOrCreate).toHaveBeenCalledWith("u1");
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
      const walletData = {
        id: "w1",
        totalBalance: 1000,
        heldBalance: 200,
        availableBalance: 800,
      };
      const getOrCreate = mock(async () => walletData);
      const listLedger = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "u1" } },
        services: { wallet: { getOrCreate, listLedger } },
      };
      const input = { limit: 10 };

      const result = await walletHandlers.listLedger({ context, input });

      expect(getOrCreate).toHaveBeenCalledWith("u1");
      expect(listLedger).toHaveBeenCalledWith("w1", input);
      expect(result).toEqual({ items: [] });
    });
  });

  describe("listPackages", () => {
    test("calls wallet.listActivePackages", async () => {
      const listActivePackages = mock(async () => [{ id: "pkg1" }]);
      const context = {
        session: { user: { id: "u1" } },
        services: { wallet: { listActivePackages } },
      };

      const result = await walletHandlers.listPackages({ context });

      expect(listActivePackages).toHaveBeenCalledWith();
      expect(result).toEqual([{ id: "pkg1" }]);
    });
  });

  describe("knowledgeBankEligible", () => {
    test("calls wallet.knowledgeBankEligible with session user id", async () => {
      const knowledgeBankEligible = mock(async () => ({ eligible: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { wallet: { knowledgeBankEligible } },
      };

      const result = await walletHandlers.knowledgeBankEligible({ context });

      expect(knowledgeBankEligible).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ eligible: true });
    });
  });

  describe("competitionCalendarLink", () => {
    test("returns url from env.COMPETITION_CALENDAR_URL", async () => {
      const result = await walletHandlers.competitionCalendarLink();

      expect(result).toEqual({ url: "https://example.com/calendar" });
    });
  });
});
