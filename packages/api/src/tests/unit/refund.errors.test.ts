import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  WalletNotFoundError,
  InvalidRefundAmountError,
  mapRefundError,
} from "../../modules/refund/refund.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("refund.errors", () => {
  describe("WalletNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new WalletNotFoundError("w_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new WalletNotFoundError("w_1");
      expect(err.code).toBe("WALLET_NOT_FOUND");
      expect(err.domain).toBe("refund");
      expect(err.message).toBe("Wallet not found");
      expect(err.details).toEqual({ walletId: "w_1" });
      expect(err.name).toBe("WalletNotFoundError");
    });
  });
  describe("InvalidRefundAmountError", () => {
    it("should be instance of DomainError", () => {
      const err = new InvalidRefundAmountError(-5, "negative");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InvalidRefundAmountError(-5, "negative");
      expect(err.code).toBe("INVALID_REFUND_AMOUNT");
      expect(err.domain).toBe("refund");
      expect(err.message).toBe("Invalid refund amount");
      expect(err.details).toEqual({ amount: -5, reason: "negative" });
      expect(err.name).toBe("InvalidRefundAmountError");
    });
  });
  describe("mapRefundError", () => {
    it("should map WalletNotFoundError to NOT_FOUND", () => {
      const result = mapRefundError(new WalletNotFoundError("w_1"));
      expect(result.status).toBe(404);
    });
    it("should map InvalidRefundAmountError to BAD_REQUEST", () => {
      const result = mapRefundError(
        new InvalidRefundAmountError(-5, "negative"),
      );
      expect(result.status).toBe(400);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapRefundError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
