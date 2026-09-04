import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  PackageNotFoundError,
  PackageAlreadyPurchasedError,
  PaymentProviderError,
  WebhookSignatureError,
  WebhookTimestampError,
  UnknownPaymentStatusError,
  mapPaymentError,
} from "../../modules/payment/payment.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("payment.errors", () => {
  describe("PackageNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new PackageNotFoundError("pkg_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new PackageNotFoundError("pkg_1");
      expect(err.code).toBe("PACKAGE_NOT_FOUND");
      expect(err.domain).toBe("payment");
      expect(err.message).toBe("Package not found");
      expect(err.details).toEqual({ code: "pkg_1" });
      expect(err.name).toBe("PackageNotFoundError");
    });
  });
  describe("PackageAlreadyPurchasedError", () => {
    it("should be instance of DomainError", () => {
      const err = new PackageAlreadyPurchasedError("pkg_1", "usr_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new PackageAlreadyPurchasedError("pkg_1", "usr_1");
      expect(err.code).toBe("PACKAGE_ALREADY_PURCHASED");
      expect(err.domain).toBe("payment");
      expect(err.message).toBe("Package already purchased for this user");
      expect(err.details).toEqual({ code: "pkg_1", userId: "usr_1" });
      expect(err.name).toBe("PackageAlreadyPurchasedError");
    });
  });
  describe("PaymentProviderError", () => {
    it("should be instance of DomainError", () => {
      const err = new PaymentProviderError("xendit", "timeout");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new PaymentProviderError("xendit", new Error("timeout"));
      expect(err.code).toBe("PAYMENT_PROVIDER_ERROR");
      expect(err.domain).toBe("payment");
      expect(err.message).toBe("Payment provider temporarily unavailable");
      expect(err.name).toBe("PaymentProviderError");
    });
    it("preserves bounded provider HTTP diagnostics", () => {
      const err = new PaymentProviderError(
        "xendit",
        new Error(
          "Payment simulation error: 403 REQUEST_FORBIDDEN_ERROR - Use a Test Mode API key",
        ),
      );
      expect(err.message).toBe(
        "Payment simulation error: 403 REQUEST_FORBIDDEN_ERROR - Use a Test Mode API key",
      );
    });
  });
  describe("WebhookSignatureError", () => {
    it("should have correct properties", () => {
      const err = new WebhookSignatureError();
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe("WEBHOOK_SIGNATURE_INVALID");
      expect(err.domain).toBe("payment");
      expect(err.message).toBe("Invalid webhook signature");
      expect(err.name).toBe("WebhookSignatureError");
    });
  });
  describe("WebhookTimestampError", () => {
    it("should have correct properties", () => {
      const err = new WebhookTimestampError("Webhook timestamp header is required");
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe("WEBHOOK_TIMESTAMP_INVALID");
      expect(err.domain).toBe("payment");
      expect(err.message).toBe("Webhook timestamp header is required");
      expect(err.name).toBe("WebhookTimestampError");
    });
  });
  describe("UnknownPaymentStatusError", () => {
    it("should have correct properties", () => {
      const err = new UnknownPaymentStatusError("BOGUS");
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe("UNKNOWN_PAYMENT_STATUS");
      expect(err.domain).toBe("payment");
      expect(err.message).toBe("Unknown payment status: BOGUS");
      expect(err.name).toBe("UnknownPaymentStatusError");
    });
  });
  describe("mapPaymentError", () => {
    it("should map PackageNotFoundError to NOT_FOUND", () => {
      const result = mapPaymentError(new PackageNotFoundError("pkg_1"));
      expect(result.status).toBe(404);
    });
    it("should map PackageAlreadyPurchasedError to CONFLICT", () => {
      const result = mapPaymentError(
        new PackageAlreadyPurchasedError("pkg_1", "usr_1"),
      );
      expect(result.status).toBe(409);
    });
    it("should map PaymentProviderError to SERVICE_UNAVAILABLE", () => {
      const result = mapPaymentError(new PaymentProviderError("xendit", "err"));
      expect(result.status).toBe(503);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapPaymentError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
