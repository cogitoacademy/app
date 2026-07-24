import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  WalletNotFoundError,
  InsufficientBalanceError,
  mapWalletError,
} from "../../modules/wallet/wallet.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("wallet.errors", () => {
  describe("WalletNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new WalletNotFoundError("w_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new WalletNotFoundError("w_1");
      expect(err.code).toBe("WALLET_NOT_FOUND");
      expect(err.domain).toBe("wallet");
      expect(err.message).toBe("Wallet not found");
      expect(err.details).toEqual({ walletId: "w_1" });
      expect(err.name).toBe("WalletNotFoundError");
    });
  });
  describe("InsufficientBalanceError", () => {
    it("should be instance of DomainError", () => {
      const err = new InsufficientBalanceError(50, 100);
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InsufficientBalanceError(50, 100);
      expect(err.code).toBe("INSUFFICIENT_BALANCE");
      expect(err.domain).toBe("wallet");
      expect(err.message).toBe("Insufficient balance");
      expect(err.details).toEqual({ available: 50, required: 100 });
      expect(err.name).toBe("InsufficientBalanceError");
    });
  });
  describe("mapWalletError", () => {
    it("should map WalletNotFoundError to NOT_FOUND", () => {
      const result = mapWalletError(new WalletNotFoundError("w_1"));
      expect(result.status).toBe(404);
    });
    it("should map InsufficientBalanceError to BAD_REQUEST", () => {
      const result = mapWalletError(new InsufficientBalanceError(50, 100));
      expect(result.status).toBe(400);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapWalletError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
