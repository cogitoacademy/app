import { describe, test, expect } from "bun:test";
import { createWalletService } from "../../modules/wallet/wallet.service";
import type { WalletSnapshot } from "../../shared/ports/wallet.port";

function makeWallet(overrides: Partial<WalletSnapshot> = {}): WalletSnapshot {
  return {
    id: "w1",
    totalBalance: 100,
    heldBalance: 20,
    availableBalance: 80,
    ...overrides,
  };
}

describe("Wallet Service", () => {
  const service = createWalletService();

  describe("validateHold", () => {
    test("returns null for valid hold", () => {
      const result = service.validateHold(
        makeWallet({ availableBalance: 100 }),
        50,
      );
      expect(result).toBeNull();
    });

    test("returns notFound for null wallet", () => {
      const result = service.validateHold(null, 50);
      expect(result).not.toBeNull();
      expect(result!.code).toBe("NOT_FOUND");
    });

    test("returns badRequest for insufficient balance", () => {
      const result = service.validateHold(
        makeWallet({ availableBalance: 30 }),
        50,
      );
      expect(result).not.toBeNull();
      expect(result!.code).toBe("BAD_REQUEST");
    });

    test("returns null when amount equals available balance", () => {
      const result = service.validateHold(
        makeWallet({ availableBalance: 50 }),
        50,
      );
      expect(result).toBeNull();
    });
  });

  describe("validateDeduct", () => {
    test("returns null for valid deduct", () => {
      const result = service.validateDeduct(makeWallet());
      expect(result).toBeNull();
    });

    test("returns notFound for null wallet", () => {
      const result = service.validateDeduct(null);
      expect(result).not.toBeNull();
      expect(result!.code).toBe("NOT_FOUND");
    });
  });
});
