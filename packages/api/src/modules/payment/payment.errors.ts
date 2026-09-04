import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  forbidden,
  conflict,
  serviceUnavailable,
  internalServerError,
} from "../../lib/errors";

export class PackageNotFoundError extends DomainError {
  readonly domain = "payment";
  constructor(code: string) {
    super("PACKAGE_NOT_FOUND", "Package not found", { code });
  }
}

export class PaymentNotFoundError extends DomainError {
  readonly domain = "payment";
  constructor(id: string) {
    super("PAYMENT_NOT_FOUND", "Payment not found", { id });
  }
}

export class PackageAlreadyPurchasedError extends DomainError {
  readonly domain = "payment";

  /**
   * @deprecated Payment attempts are repeatable. Kept for compatibility with
   * older callers/error mappings; createIntent no longer throws this error.
   */
  constructor(code: string, userId: string) {
    super(
      "PACKAGE_ALREADY_PURCHASED",
      "Package already purchased for this user",
      { code, userId },
    );
  }
}

export class PaymentProviderError extends DomainError {
  readonly domain = "payment";
  constructor(provider: string, originalError: unknown) {
    // The provider adapter only exposes bounded, single-line operation
    // diagnostics (HTTP status + provider error code/message). Preserve those
    // diagnostics for the client; arbitrary errors stay generic so internal
    // infrastructure details never leak through the API.
    const originalMessage =
      originalError instanceof Error
        ? originalError.message.replace(/\s+/g, " ").trim()
        : "";
    const publicMessage =
      /^(?:Payment provider(?: refund)?|Payment simulation|Payment status) error: \d{3}\b/.test(
        originalMessage,
      )
        ? originalMessage.slice(0, 320)
        : "Payment provider temporarily unavailable";
    super("PAYMENT_PROVIDER_ERROR", publicMessage, {
      provider,
      originalError: String(originalError),
    });
  }
}

export class PaymentTestModeRestrictedError extends DomainError {
  readonly domain = "payment";
  constructor() {
    super(
      "PAYMENT_TEST_MODE_RESTRICTED",
      "Payment Test Mode is restricted to approved UAT accounts",
    );
  }
}

export class PaymentSimulationUnavailableError extends DomainError {
  readonly domain = "payment";
  constructor() {
    super(
      "PAYMENT_SIMULATION_UNAVAILABLE",
      "Payment simulation is only available to approved Test Mode accounts",
    );
  }
}

/**
 * Webhook signature verification failed (Xendit `x-callback-token` header or
 * Midtrans body `signature_key`). Typed so the webhook route can classify the
 * failure as a 401 without message sniffing.
 */
export class WebhookSignatureError extends DomainError {
  readonly domain = "payment";
  constructor() {
    super("WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature");
  }
}

/**
 * Webhook timestamp missing/invalid/stale (non-Xendit, non-Midtrans
 * providers). Typed so the webhook route can classify the failure as a 408
 * without message sniffing.
 */
export class WebhookTimestampError extends DomainError {
  readonly domain = "payment";
  constructor(message: string) {
    super("WEBHOOK_TIMESTAMP_INVALID", message);
  }
}

/**
 * The provider reported a status the mapping table does not know — a
 * permanent provider-side bug that retrying will never fix. Typed so the
 * webhook route can dead-letter it (4xx) without message sniffing.
 */
export class UnknownPaymentStatusError extends DomainError {
  readonly domain = "payment";
  constructor(status: string) {
    super("UNKNOWN_PAYMENT_STATUS", `Unknown payment status: ${status}`);
  }
}

export function mapPaymentError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof PackageNotFoundError) return notFound(err.message, err);
  if (err instanceof PaymentNotFoundError) return notFound(err.message, err);
  if (err instanceof PackageAlreadyPurchasedError)
    return conflict(err.message, err);
  if (err instanceof PaymentTestModeRestrictedError)
    return forbidden(err.message, err);
  if (err instanceof PaymentSimulationUnavailableError)
    return forbidden(err.message, err);
  if (err instanceof PaymentProviderError)
    return serviceUnavailable(err.message, err);
  return internalServerError(err.message, err);
}
