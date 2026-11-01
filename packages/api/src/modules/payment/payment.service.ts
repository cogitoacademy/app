import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { PAYMENT_STATUS, ACTOR_TYPE } from "../../shared/constants";
import { NOTIFICATION_CATEGORY } from "../../shared/constants";
import { NOTIFICATION_SEVERITY } from "../../shared/constants";
import type { NotificationWriteParams } from "../notification/notification.service";
import {
  PaymentNotFoundError,
  PaymentProviderError,
  PaymentSimulationUnavailableError,
  PaymentWebhookMismatchError,
  V3TopUpUnavailableError,
  V3PackagePurchaseDisabledError,
  TopUpQuoteNotFoundError,
  TopUpQuoteExpiredError,
  TopUpQuoteRequestConflictError,
  TopUpQuoteChoiceConflictError,
  V3TopUpChoiceUnavailableError,
  TopUpAmountOutOfRangeError,
} from "./payment.errors";
import type { PaymentWalletPort } from "./index";
import type { PaymentAuditPort } from "./index";
import type { PaymentRefundRecordPort } from "./index";
import {
  recordPaymentIntegrity,
  recordPaymentReconciliation,
} from "../../lib/metrics";
import type { PaymentRepo } from "./payment.repo";
import type { EconomyService } from "../economy/economy.service";
import { calculateV3TopUpPrice } from "../pricing/v3-rate-card";

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "SETTLED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";

export interface WebhookPayload {
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
  amountIdr?: number;
  refundAmountIdr?: number;
  currency?: string;
  refundKind?: "full" | "partial";
  providerRefundIdentity?: string | null;
  providerSuccessAt?: Date | null;
  providerSuccessTimeStatus?: "verified" | "unavailable";
}

export interface PaymentProvider {
  createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{
    checkoutUrl: string;
    // Provider-side request/order id, stored for status lookups and refunds.
    paymentRequestId?: string | null;
  }>;
  verifyWebhook(rawBody: string, signature: string): Promise<WebhookPayload>;
  /**
   * Initiates a provider-side refund. Returns the provider refund id for
   * storage on refundRecord. Stub providers return a mock id.
   */
  refund(
    paymentRequestId: string,
    amountIdr: number,
    reason?: string,
  ): Promise<{ providerRefundId: string }>;
  simulatePayment?(
    paymentRequestId: string,
    amountIdr: number,
  ): Promise<{ status: "PENDING"; message: string }>;
  getPaymentRequestStatus?(paymentRequestId: string): Promise<WebhookPayload>;
}

export type PaymentPort = PaymentProvider;

export interface CreateIntentResult {
  paymentId: string;
  providerReference: string;
  checkoutUrl: string | null;
  status?: PaymentStatus;
  recoveryRequired?: boolean;
}

type TopUpChoice = "package" | "custom" | "recommended";

interface TopUpPackageTerms {
  code: string;
  marks: number;
  priceIdr: number;
}

interface TopUpTermsSnapshot {
  packages: TopUpPackageTerms[];
  exactSurchargeIdr: number;
  exactPackageCode: string | null;
  customAmountIdr: number;
  recommendation: TopUpPackageTerms | null;
}

const V3_TOP_UP_QUOTE_TTL_MS = 15 * 60 * 1000;

function topUpPackageDto(pkg: TopUpPackageTerms) {
  return {
    code: pkg.code,
    label: `${pkg.code
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ")} package`,
    marks: pkg.marks,
    priceIdr: pkg.priceIdr,
  };
}

function getTopUpTerms(snapshot: unknown): TopUpTermsSnapshot {
  const value = snapshot as Partial<TopUpTermsSnapshot>;
  if (
    !value ||
    !Array.isArray(value.packages) ||
    typeof value.exactSurchargeIdr !== "number" ||
    typeof value.customAmountIdr !== "number" ||
    (value.exactPackageCode !== null &&
      typeof value.exactPackageCode !== "string") ||
    (value.recommendation !== null && typeof value.recommendation !== "object")
  ) {
    throw new Error("Stored V3 top-up quote terms are invalid");
  }
  return value as TopUpTermsSnapshot;
}

function topUpQuoteDto(quote: {
  id: string;
  revision: number;
  requestedMarks: number;
  termsSnapshot: unknown;
  expiresAt: Date;
}) {
  const terms = getTopUpTerms(quote.termsSnapshot);
  const exactPackage = terms.exactPackageCode
    ? terms.packages.find((item) => item.code === terms.exactPackageCode)
    : null;
  return {
    quoteId: quote.id,
    revision: quote.revision,
    marks: quote.requestedMarks,
    customAmountIdr: terms.customAmountIdr,
    exactPackage: exactPackage ? topUpPackageDto(exactPackage) : null,
    recommendedPackage: terms.recommendation
      ? topUpPackageDto(terms.recommendation)
      : null,
    expiresAt: quote.expiresAt.toISOString(),
  };
}

function selectTopUpTerms(
  quote: { requestedMarks: number; termsSnapshot: unknown },
  choice: TopUpChoice,
) {
  const terms = getTopUpTerms(quote.termsSnapshot);
  if (choice === "package") {
    const pkg = terms.exactPackageCode
      ? terms.packages.find((item) => item.code === terms.exactPackageCode)
      : null;
    if (!pkg) throw new V3TopUpChoiceUnavailableError();
    return {
      marks: pkg.marks,
      amountIdr: pkg.priceIdr,
      label: `${topUpPackageDto(pkg).label} · ${pkg.marks} Marks`,
    };
  }
  if (choice === "custom") {
    if (terms.exactPackageCode) throw new V3TopUpChoiceUnavailableError();
    return {
      marks: quote.requestedMarks,
      amountIdr: terms.customAmountIdr,
      label: `Custom top-up · ${quote.requestedMarks} Marks`,
    };
  }
  if (choice === "recommended" && terms.recommendation) {
    return {
      marks: terms.recommendation.marks,
      amountIdr: terms.recommendation.priceIdr,
      label: `Recommended ${topUpPackageDto(terms.recommendation).label} · ${terms.recommendation.marks} Marks`,
    };
  }
  throw new V3TopUpChoiceUnavailableError();
}

export interface ConfirmInput {
  provider: string;
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
  amountIdr?: number;
  refundAmountIdr?: number;
  currency?: string;
  refundKind?: "full" | "partial";
  providerRefundIdentity?: string | null;
  providerSuccessAt?: Date | null;
  providerSuccessTimeStatus?: "verified" | "unavailable";
}

export type PaymentService = ReturnType<typeof createPaymentService>;

export interface PaymentNotificationPort {
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

export interface KolCommissionPort {
  recordSuccessfulKolTopUp(
    conn: DbOrTx,
    input: {
      paymentId: string;
      providerSuccessTimeStatus?: "verified" | "unavailable";
    },
  ): Promise<unknown>;
}

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["PAID", "FAILED", "EXPIRED", "SETTLED", "REFUNDED"],
  PAID: ["SETTLED", "REFUNDED"],
  SETTLED: ["REFUNDED"],
  FAILED: ["PAID", "SETTLED", "REFUNDED"],
  EXPIRED: ["PAID", "SETTLED", "REFUNDED"],
  REFUNDED: [],
};

/**
 * A provider simulation can be retried after payment already completed. The
 * provider may reject the consumed payment method instead of returning status;
 * authoritative status lookup is the safe recovery path.
 */
function isInactiveSimulationError(error: unknown): boolean {
  return String(error).includes("400 INACTIVE_PAYMENT_METHOD");
}

/**
 * Reconciliation lookback: attempts older than this are never going to
 * settle (provider checkouts expire on their own within hours-days), so the
 * 15m scheduler skips them instead of retrying forever. Stale rows need
 * manual disposition to EXPIRED via the admin flow.
 */
const RECONCILE_ATTEMPT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Channel-fee tolerance for PAID/SETTLED gross validation. The provider
 * charges the customer package price + channel fee (VA Rp4,000 + 11% VAT =
 * Rp4,440 observed; outlets ~Rp5k; QRIS 0.7%; wallets ~2%; cards 2.9%+2k),
 * so exact equality false-rejects real fee-bearing payments. Anything
 * beyond the cap (e.g. a Rp1M overpay) is anomalous and still throws.
 */
const MAX_CHANNEL_FEE_FLAT_IDR = 10_000;
const MAX_CHANNEL_FEE_RATE = 0.03;

function earliestVerifiedProviderTime(
  current: Date | null | undefined,
  incoming: Date | null | undefined,
) {
  const currentTime =
    current instanceof Date && Number.isFinite(current.getTime())
      ? current
      : null;
  const incomingTime =
    incoming instanceof Date && Number.isFinite(incoming.getTime())
      ? incoming
      : null;
  if (!currentTime) return incomingTime;
  if (!incomingTime) return currentTime;
  return incomingTime < currentTime ? incomingTime : currentTime;
}

/**
 * Creates the payment service for purchase intents, webhook confirmation, and purchase lookups.
 *
 * @param deps - the dependency ports (db, wallet, repo, provider, providerName)
 * @returns a PaymentPort with createIntent, confirmFromWebhook, getPurchase and the provider
 */
export function createPaymentService(deps: {
  db: DbType;
  economy?: Pick<EconomyService, "getActiveV3Config">;
  wallet: PaymentWalletPort;
  repo: PaymentRepo;
  provider: PaymentProvider;
  providerName: string;
  notification?: PaymentNotificationPort;
  audit?: PaymentAuditPort;
  refundRecord?: PaymentRefundRecordPort;
  kolCommission?: KolCommissionPort;
}) {
  const {
    db,
    economy,
    wallet,
    repo,
    provider,
    providerName,
    notification,
    audit,
    refundRecord,
    kolCommission,
  } = deps;

  async function getTopUpCatalog() {
    const active = economy ? await economy.getActiveV3Config(db) : null;
    if (!active) {
      return {
        active: false as const,
        revision: null,
        packages: [],
        exactSurchargeIdr: 0,
        quoteTtlSeconds: 900 as const,
      };
    }
    return {
      active: true as const,
      revision: active.version,
      packages: active.values.packages.map(topUpPackageDto),
      exactSurchargeIdr: active.values.exactSurchargeIdr,
      quoteTtlSeconds: 900 as const,
    };
  }

  async function createTopUpQuote(
    userId: string,
    input: { requestKey: string; marks: number },
  ) {
    return db.transaction(async (tx) => {
      const existing = await repo.findTopUpQuoteByRequestKey(
        userId,
        input.requestKey,
        tx,
      );
      if (existing) {
        if (existing.requestedMarks !== input.marks) {
          throw new TopUpQuoteRequestConflictError();
        }
        return topUpQuoteDto(existing);
      }

      const active = economy ? await economy.getActiveV3Config(tx) : null;
      if (!active) throw new V3TopUpUnavailableError();
      const calculation = calculateV3TopUpPrice(input.marks, active.values);
      if (calculation.amountIdr > 2_147_483_647) {
        throw new TopUpAmountOutOfRangeError();
      }
      const termsSnapshot: TopUpTermsSnapshot = {
        packages: active.values.packages.map(({ code, marks, priceIdr }) => ({
          code,
          marks,
          priceIdr,
        })),
        exactSurchargeIdr: active.values.exactSurchargeIdr,
        exactPackageCode: calculation.packageCode,
        customAmountIdr: calculation.amountIdr,
        recommendation: calculation.recommendation,
      };
      const inserted = await repo.insertTopUpQuote(
        {
          id: crypto.randomUUID(),
          userId,
          requestKey: input.requestKey,
          revision: active.version,
          requestedMarks: input.marks,
          termsSnapshot,
          expiresAt: new Date(Date.now() + V3_TOP_UP_QUOTE_TTL_MS),
        },
        tx,
      );
      if (inserted) return topUpQuoteDto(inserted);

      const winner = await repo.findTopUpQuoteByRequestKey(
        userId,
        input.requestKey,
        tx,
      );
      if (!winner) throw new Error("Top-up quote could not be saved");
      if (winner.requestedMarks !== input.marks) {
        throw new TopUpQuoteRequestConflictError();
      }
      return topUpQuoteDto(winner);
    });
  }

  function topUpPurchaseResult(
    record: NonNullable<Awaited<ReturnType<typeof repo.findPaymentById>>>,
  ) {
    return {
      paymentId: record.id,
      providerReference: record.providerReference,
      checkoutUrl: record.checkoutUrl,
      status: record.status as PaymentStatus,
      recoveryRequired:
        record.status === PAYMENT_STATUS.PENDING && !record.checkoutUrl,
      quoteId: record.quoteId!,
      choice: record.quoteChoice as TopUpChoice,
      purchaseLabel: record.purchaseLabel ?? `Top-up · ${record.marks} Marks`,
    };
  }

  async function createPurchaseFromTopUpQuote(
    userId: string,
    walletId: string,
    quoteId: string,
    choice: TopUpChoice,
  ) {
    const outcome = await db.transaction(async (tx) => {
      const quote = await repo.findTopUpQuoteById(userId, quoteId, tx, true);
      if (!quote) throw new TopUpQuoteNotFoundError();

      const existing = await repo.findPaymentByQuote(quote.id, tx);
      if (existing) {
        if (existing.quoteChoice !== choice) {
          throw new TopUpQuoteChoiceConflictError();
        }
        return { kind: "existing" as const, record: existing };
      }

      if (quote.expiresAt.getTime() <= Date.now()) {
        throw new TopUpQuoteExpiredError();
      }
      const selected = selectTopUpTerms(quote, choice);
      const paymentId = crypto.randomUUID();
      const providerReference = `${providerName}:v3:${paymentId}`;
      const pricingSnapshot = {
        schema: "v3-top-up-v1",
        quoteId: quote.id,
        revision: quote.revision,
        choice,
        marks: selected.marks,
        amountIdr: selected.amountIdr,
        label: selected.label,
        terms: quote.termsSnapshot,
      };
      const inserted = await repo.insertPayment(
        {
          id: paymentId,
          userId,
          walletId,
          packageId: null,
          quoteId: quote.id,
          quoteChoice: choice,
          purchaseLabel: selected.label,
          pricingSnapshot,
          provider: providerName,
          providerReference,
          // Midtrans order_id is this stable UUID. Save it before network I/O
          // so an uncertain response can be reconciled without a new order.
          providerRequestId:
            providerName === "midtrans" ? paymentId : undefined,
          providerIntentState: "CREATING",
          amountIdr: selected.amountIdr,
          marks: selected.marks,
          status: PAYMENT_STATUS.PENDING,
        },
        tx,
      );
      if (!inserted) {
        const winner = await repo.findPaymentByQuote(quote.id, tx);
        if (!winner) throw new Error("Top-up payment could not be saved");
        if (winner.quoteChoice !== choice) {
          throw new TopUpQuoteChoiceConflictError();
        }
        return { kind: "existing" as const, record: winner };
      }
      return { kind: "create" as const, record: inserted };
    });

    if (outcome.kind === "existing") {
      if (
        outcome.record.status === PAYMENT_STATUS.PENDING &&
        !outcome.record.checkoutUrl &&
        outcome.record.providerRequestId &&
        provider.getPaymentRequestStatus
      ) {
        try {
          await reconcilePurchase(outcome.record.id, userId);
        } catch {
          // An absent/uncertain provider response never authorizes a second
          // createIntent call for this quote.
        }
      }
      const current = await repo.findPaymentById(outcome.record.id);
      if (!current) throw new PaymentNotFoundError(outcome.record.id);
      return topUpPurchaseResult(current);
    }

    try {
      const intent = await provider.createIntent({
        paymentId: outcome.record.id,
        amountIdr: outcome.record.amountIdr,
        providerReference: outcome.record.providerReference,
      });
      await repo.updatePaymentIntent(outcome.record.id, {
        providerRequestId:
          intent.paymentRequestId ??
          outcome.record.providerRequestId ??
          undefined,
        checkoutUrl: intent.checkoutUrl,
        providerIntentState: "READY",
      });
    } catch {
      await repo.updatePaymentIntent(outcome.record.id, {
        providerIntentState: "UNCERTAIN",
      });
      if (
        outcome.record.providerRequestId &&
        provider.getPaymentRequestStatus
      ) {
        try {
          await reconcilePurchase(outcome.record.id, userId);
        } catch {
          // Keep the same payment identity available for status recovery.
        }
      }
    }

    const current = await repo.findPaymentById(outcome.record.id);
    if (!current) throw new PaymentNotFoundError(outcome.record.id);
    return topUpPurchaseResult(current);
  }

  // Retired entry point: all purchases require an explicit V3 quote choice.
  async function createIntent(
    _userId: string,
    _walletId: string,
    _packageCode: string,
  ): Promise<CreateIntentResult> {
    throw new V3PackagePurchaseDisabledError();
  }

  async function simulatePurchase(paymentId: string, userId: string) {
    const record = await repo.findPaymentById(paymentId);
    if (!record || record.userId !== userId) {
      throw new PaymentNotFoundError(paymentId);
    }
    if (
      record.status !== PAYMENT_STATUS.PENDING ||
      !record.providerRequestId ||
      !provider.simulatePayment
    ) {
      throw new PaymentSimulationUnavailableError();
    }

    try {
      return await provider.simulatePayment(
        record.providerRequestId,
        record.amountIdr,
      );
    } catch (error) {
      if (isInactiveSimulationError(error)) {
        try {
          const reconciled = await reconcilePurchase(paymentId, userId);
          if (
            reconciled.status === PAYMENT_STATUS.PAID ||
            reconciled.status === PAYMENT_STATUS.SETTLED
          ) {
            // Keep the simulation response contract PENDING. The client starts
            // its normal getPurchase poll after a successful mutation, which
            // then observes the reconciled terminal status and refreshes the
            // wallet. The credit itself is performed by confirmFromWebhook's
            // idempotent transaction above.
            return {
              status: "PENDING" as const,
              message:
                "Payment was already completed; confirmation has been reconciled",
            };
          }
        } catch {
          // Preserve the original inactive-payment diagnostic if the
          // best-effort status lookup cannot recover the payment.
        }
      }
      throw new PaymentProviderError(providerName, error);
    }
  }

  async function reconcilePurchase(paymentId: string, userId: string) {
    const record = await repo.findPaymentById(paymentId);
    if (!record || record.userId !== userId) {
      throw new PaymentNotFoundError(paymentId);
    }
    if (
      record.status !== PAYMENT_STATUS.PENDING ||
      !record.providerRequestId ||
      !provider.getPaymentRequestStatus
    ) {
      return { status: record.status };
    }

    try {
      const remote = await provider.getPaymentRequestStatus(
        record.providerRequestId,
      );
      if (remote.status === PAYMENT_STATUS.PENDING) {
        return { status: record.status };
      }
      return confirmFromWebhook({
        provider: providerName,
        ...remote,
        // Retain database reference if provider response omits it while still
        // reporting terminal status.
        providerReference: remote.providerReference || record.providerReference,
      });
    } catch (error) {
      throw new PaymentProviderError(providerName, error);
    }
  }

  async function reconcilePendingPayments(limit = 50) {
    if (!provider.getPaymentRequestStatus) {
      return { checked: 0, reconciled: 0, pending: 0, failed: 0 };
    }
    const records = await repo.findPaymentsForReconciliation(
      providerName,
      new Date(Date.now() - 5 * 60 * 1000),
      Math.min(Math.max(limit, 1), 100),
      // Dead-checkout guard: provider links expire on their own, so an
      // attempt older than this is never going to settle. Retrying it every
      // 15m forever only inflates the integrity/reconciliation counters —
      // such rows need manual disposition, not reconciliation.
      new Date(Date.now() - RECONCILE_ATTEMPT_LOOKBACK_MS),
    );
    let reconciled = 0;
    let pending = 0;
    let failed = 0;
    for (const record of records) {
      try {
        const remote = await provider.getPaymentRequestStatus(
          record.providerRequestId!,
        );
        if (remote.status === PAYMENT_STATUS.PENDING) {
          pending += 1;
          if (providerName === "midtrans")
            recordPaymentReconciliation("midtrans", "pending");
          continue;
        }
        await confirmFromWebhook({
          provider: providerName,
          ...remote,
          providerReference:
            remote.providerReference || record.providerReference,
        });
        reconciled += 1;
        if (providerName === "midtrans")
          recordPaymentReconciliation("midtrans", "reconciled");
      } catch {
        failed += 1;
        if (providerName === "midtrans")
          recordPaymentReconciliation("midtrans", "failed");
      }
    }
    return { checked: records.length, reconciled, pending, failed };
  }

  /**
   * Confirms a provider webhook, crediting the wallet on PAID/SETTLED and enforcing idempotency.
   *
   * @param input - the webhook confirmation details (provider, references, status, receipt)
   * @returns the resulting payment status
   * @throws {PaymentNotFoundError} if no payment matches the provider reference
   */
  async function confirmFromWebhook(
    input: ConfirmInput,
  ): Promise<{ status: string }> {
    return db.transaction(async (tx) => {
      const record = await repo.findPaymentByProviderReference(
        input.providerReference,
        tx,
        true,
      );

      if (!record) throw new PaymentNotFoundError(input.providerReference);
      if (record.provider && record.provider !== input.provider) {
        if (providerName === "midtrans")
          recordPaymentIntegrity("midtrans", "provider_mismatch");
        throw new PaymentWebhookMismatchError("Payment provider mismatch");
      }
      // Full and partial refund statuses must bind to the original charge.
      // A partial refund can be the first successful status we observe, so its
      // branch below credits saved Marks once without prorating or reversing
      // them. Provider gross includes channel fees, so charge/refund checks
      // allow the same capped tolerance; wallet credit uses saved package Marks.
      const creditsMoney =
        input.status === PAYMENT_STATUS.PAID ||
        input.status === PAYMENT_STATUS.SETTLED;
      const validatesProviderAmount =
        creditsMoney || input.status === PAYMENT_STATUS.REFUNDED;
      const requiresBoundRefundStatus =
        providerName === "midtrans" && input.status === PAYMENT_STATUS.REFUNDED;
      if (
        requiresBoundRefundStatus &&
        (input.amountIdr === undefined || input.currency === undefined)
      ) {
        recordPaymentIntegrity("midtrans", "amount_mismatch");
        throw new PaymentWebhookMismatchError(
          "Payment refund status is missing its amount or currency",
        );
      }
      if (
        validatesProviderAmount &&
        input.currency !== undefined &&
        input.currency !== "IDR"
      ) {
        if (providerName === "midtrans")
          recordPaymentIntegrity("midtrans", "currency_mismatch");
        throw new PaymentWebhookMismatchError("Payment currency mismatch", {
          receivedCurrency: input.currency,
        });
      }
      if (validatesProviderAmount && input.amountIdr !== undefined) {
        const overpaid = input.amountIdr - record.amountIdr;
        const feeTolerance = Math.max(
          MAX_CHANNEL_FEE_FLAT_IDR,
          Math.ceil(record.amountIdr * MAX_CHANNEL_FEE_RATE),
        );
        if (overpaid < 0 || overpaid > feeTolerance) {
          if (providerName === "midtrans")
            recordPaymentIntegrity("midtrans", "amount_mismatch");
          throw new PaymentWebhookMismatchError("Payment amount mismatch", {
            expectedAmountIdr: record.amountIdr,
            receivedAmountIdr: input.amountIdr,
            overpaidAmountIdr: overpaid,
            feeToleranceIdr: feeTolerance,
          });
        }
      }

      if (
        input.status === PAYMENT_STATUS.REFUNDED &&
        input.refundAmountIdr !== undefined &&
        (!Number.isSafeInteger(input.refundAmountIdr) ||
          input.refundAmountIdr < 0 ||
          (input.amountIdr !== undefined &&
            input.refundAmountIdr > input.amountIdr))
      ) {
        throw new PaymentWebhookMismatchError("Payment refund amount mismatch");
      }
      if (input.providerEventId) {
        const existing = await repo.findPaymentByProviderEventId(
          input.providerEventId,
          tx,
        );
        if (existing && existing.id !== record.id) {
          return { status: existing.status };
        }
      }

      const incomingSuccessAt =
        input.providerSuccessAt instanceof Date &&
        Number.isFinite(input.providerSuccessAt.getTime())
          ? input.providerSuccessAt
          : null;
      const providerSuccessAt = earliestVerifiedProviderTime(
        record.providerSuccessAt,
        incomingSuccessAt,
      );
      const providerSuccessTimeChanged =
        providerSuccessAt?.getTime() !== record.providerSuccessAt?.getTime();
      const providerSuccessTimeStatus = providerSuccessAt
        ? "verified"
        : (input.providerSuccessTimeStatus ?? "unavailable");
      const incomingRefundKind =
        input.status === PAYMENT_STATUS.REFUNDED
          ? (input.refundKind ?? "full")
          : input.refundKind;
      const alreadyFullyRefunded =
        record.status === PAYMENT_STATUS.REFUNDED ||
        record.providerRefundKind === "full";
      const incomingRefundIdentity =
        typeof input.providerRefundIdentity === "string" &&
        /^[a-f0-9]{64}$/.test(input.providerRefundIdentity)
          ? input.providerRefundIdentity
          : null;
      const providerRefundAmountIdr =
        input.refundAmountIdr === undefined
          ? (record.providerRefundAmountIdr ?? null)
          : Math.max(
              record.providerRefundAmountIdr ?? 0,
              input.refundAmountIdr,
            );
      const providerRefundIdentity = alreadyFullyRefunded
        ? incomingRefundKind === "full" && incomingRefundIdentity
          ? incomingRefundIdentity
          : (record.providerRefundIdentity ?? null)
        : (incomingRefundIdentity ?? record.providerRefundIdentity ?? null);

      if (
        input.status === PAYMENT_STATUS.REFUNDED &&
        incomingRefundKind === "partial" &&
        !alreadyFullyRefunded
      ) {
        if (providerName === "midtrans")
          recordPaymentIntegrity("midtrans", "partial_refund");
        // Midtrans can report partial_refund before the success notification is
        // delivered. The status lifecycle only reaches partial_refund from a
        // successful settlement, so record the original purchase and credit
        // its Marks once while retaining the partial-refund reconciliation.
        const creditsSuccessfulPartialPurchase =
          record.status !== PAYMENT_STATUS.PAID &&
          record.status !== PAYMENT_STATUS.SETTLED;
        const statusAfterPartialRefund = creditsSuccessfulPartialPurchase
          ? PAYMENT_STATUS.SETTLED
          : record.status;
        const providerEventIdChanged =
          typeof input.providerEventId === "string" &&
          input.providerEventId.length > 0 &&
          record.providerEventId !== input.providerEventId;
        const refundFactsChanged =
          record.providerRefundKind !== "partial" ||
          record.providerRefundAmountIdr !== providerRefundAmountIdr ||
          record.providerRefundIdentity !== providerRefundIdentity;
        const changed =
          refundFactsChanged ||
          providerEventIdChanged ||
          providerSuccessTimeChanged ||
          statusAfterPartialRefund !== record.status;
        if (changed) {
          await repo.updatePaymentStatus(
            record.id,
            {
              status: statusAfterPartialRefund,
              providerEventId: input.providerEventId,
              providerSuccessAt,
              providerRefundKind: "partial",
              providerRefundAmountIdr,
              providerRefundIdentity,
            },
            tx,
          );
        }
        if (changed && audit) {
          await audit.record({
            db: tx,
            actorId: null,
            actorType: ACTOR_TYPE.SYSTEM,
            action: "partial_refund_reconciliation",
            targetId: record.id,
            targetType: "payment_record",
            beforeState: {
              persistedPaymentStatus: record.status,
              providerSuccessAt: record.providerSuccessAt ?? null,
              refundKind: record.providerRefundKind ?? null,
              refundAmountIdr: record.providerRefundAmountIdr ?? null,
              providerRefundIdentity: record.providerRefundIdentity ?? null,
            },
            afterState: {
              persistedPaymentStatus: statusAfterPartialRefund,
              providerSuccessAt,
              refundKind: "partial",
              refundAmountIdr: providerRefundAmountIdr,
              providerRefundIdentity,
              reconciliationRequired: true,
            },
            details: {
              paymentId: record.id,
              providerEventId: input.providerEventId,
              amountIdr: input.amountIdr,
            },
          });
        }
        // Preserve the existing manual-reconciliation record for a new
        // authenticated partial-refund fact. Its event ID insert is idempotent;
        // the later full refund is processed through the payment status path.
        if (refundFactsChanged && input.providerEventId && refundRecord) {
          await refundRecord.insertRefundRecord(tx, {
            paymentId: record.id,
            walletId: record.walletId,
            amountIdr: input.refundAmountIdr ?? providerRefundAmountIdr ?? 0,
            marks: 0,
            reason:
              "Provider partial refund: manual Marks reconciliation required",
            providerEventId: input.providerEventId,
          });
        }
        await kolCommission?.recordSuccessfulKolTopUp(tx, {
          paymentId: record.id,
          providerSuccessTimeStatus,
        });
        if (creditsSuccessfulPartialPurchase) {
          await wallet.credit(tx, {
            walletId: record.walletId,
            actorType: "student",
            amount: record.marks,
            eventKey: `purchase.${record.id}`,
            sourceReference: record.id,
            reason: record.purchaseLabel ?? `Purchase: ${record.marks} Marks`,
          });
          if (notification) {
            await notification.writeBestEffort({
              db: tx,
              userId: record.userId,
              category: NOTIFICATION_CATEGORY.PAYMENT,
              severity: NOTIFICATION_SEVERITY.ACTION,
              title: "Payment received",
              body: `Your payment of ${record.amountIdr} IDR was received and ${record.marks} Marks were added to your balance. A partial refund needs manual reconciliation.`,
              eventKey: `payment.${record.id}.credited`,
              emailRequired: true,
            });
          }
        }
        return { status: statusAfterPartialRefund };
      }

      if (record.status === PAYMENT_STATUS.REFUNDED) {
        if (input.status !== PAYMENT_STATUS.REFUNDED) {
          return { status: PAYMENT_STATUS.REFUNDED };
        }
        if (
          providerSuccessTimeChanged ||
          record.providerRefundKind !== "full" ||
          record.providerRefundAmountIdr !== providerRefundAmountIdr ||
          record.providerRefundIdentity !== providerRefundIdentity
        ) {
          await repo.updatePaymentStatus(
            record.id,
            {
              status: PAYMENT_STATUS.REFUNDED,
              providerEventId: input.providerEventId,
              providerSuccessAt,
              providerRefundKind: "full",
              providerRefundAmountIdr,
              providerRefundIdentity,
            },
            tx,
          );
        }
        await kolCommission?.recordSuccessfulKolTopUp(tx, {
          paymentId: record.id,
          providerSuccessTimeStatus,
        });
        return { status: PAYMENT_STATUS.REFUNDED };
      }

      // A later authenticated status lookup may expose a provider timestamp
      // that was unavailable on the first success response. Persist that
      // evidence and re-evaluate the KOL hold without replaying the wallet
      // credit. A settled row also ignores any attempt to move it backwards.
      if (
        (record.status === PAYMENT_STATUS.PAID &&
          input.status === PAYMENT_STATUS.PAID) ||
        (record.status === PAYMENT_STATUS.SETTLED &&
          (input.status === PAYMENT_STATUS.PAID ||
            input.status === PAYMENT_STATUS.SETTLED))
      ) {
        if (providerSuccessTimeChanged) {
          await repo.updatePaymentStatus(
            record.id,
            {
              status: record.status,
              providerEventId: input.providerEventId,
              providerSuccessAt,
              ...(record.providerRefundKind
                ? {
                    providerRefundKind: record.providerRefundKind,
                    providerRefundAmountIdr,
                    providerRefundIdentity,
                  }
                : {}),
            },
            tx,
          );
        }
        await kolCommission?.recordSuccessfulKolTopUp(tx, {
          paymentId: record.id,
          providerSuccessTimeStatus,
        });
        return { status: record.status };
      }

      if (
        input.status === PAYMENT_STATUS.REFUNDED &&
        (record.status === PAYMENT_STATUS.PENDING ||
          record.status === PAYMENT_STATUS.FAILED ||
          record.status === PAYMENT_STATUS.EXPIRED)
      ) {
        // The provider confirms this purchase was refunded before our local
        // success callback. Reserve its KOL first-event identity without ever
        // crediting its Marks; the decision port records an unresolved hold if
        // Midtrans no longer exposes the original success time.
        await repo.updatePaymentStatus(
          record.id,
          {
            status: PAYMENT_STATUS.REFUNDED,
            providerEventId: input.providerEventId,
            failureReason: input.failureReason ?? null,
            providerSuccessAt,
            providerRefundKind: "full",
            providerRefundAmountIdr,
            providerRefundIdentity,
          },
          tx,
        );
        await kolCommission?.recordSuccessfulKolTopUp(tx, {
          paymentId: record.id,
          providerSuccessTimeStatus,
        });
        return { status: PAYMENT_STATUS.REFUNDED };
      }

      // PAID/SETTLED are terminal for idempotency purposes, EXCEPT a REFUNDED
      // webhook (per ALLOWED_TRANSITIONS PAID/SETTLED -> REFUNDED) which must be
      // processed so the payment is marked REFUNDED and the payer is notified.
      if (
        record.status === PAYMENT_STATUS.PAID &&
        input.status !== PAYMENT_STATUS.REFUNDED
      )
        return { status: PAYMENT_STATUS.PAID };
      if (
        record.status === PAYMENT_STATUS.FAILED &&
        input.status !== PAYMENT_STATUS.PAID &&
        input.status !== PAYMENT_STATUS.SETTLED &&
        input.status !== PAYMENT_STATUS.REFUNDED
      )
        return { status: PAYMENT_STATUS.FAILED };
      if (
        record.status === PAYMENT_STATUS.SETTLED &&
        input.status !== PAYMENT_STATUS.REFUNDED
      )
        return { status: PAYMENT_STATUS.SETTLED };
      if (
        record.status === PAYMENT_STATUS.EXPIRED &&
        input.status !== PAYMENT_STATUS.PAID &&
        input.status !== PAYMENT_STATUS.SETTLED &&
        input.status !== PAYMENT_STATUS.REFUNDED
      )
        return { status: PAYMENT_STATUS.EXPIRED };

      const allowed = ALLOWED_TRANSITIONS[record.status] ?? [];
      if (!allowed.includes(input.status)) {
        return { status: record.status };
      }

      // Existing credited states returned above; every allowed success here
      // is the first credit for this payment.
      if (
        input.status === PAYMENT_STATUS.PAID ||
        input.status === PAYMENT_STATUS.SETTLED
      ) {
        const statusUpdate = {
          status: input.status,
          providerEventId: input.providerEventId,
          receiptUrl: input.receiptUrl ?? null,
          ...(providerSuccessAt ? { providerSuccessAt } : {}),
        };
        await repo.updatePaymentStatus(record.id, statusUpdate, tx);

        await kolCommission?.recordSuccessfulKolTopUp(tx, {
          paymentId: record.id,
          providerSuccessTimeStatus,
        });

        {
          await wallet.credit(tx, {
            walletId: record.walletId,
            actorType: "student",
            amount: record.marks,
            eventKey: `purchase.${record.id}`,
            sourceReference: record.id,
            reason: record.purchaseLabel ?? `Purchase: ${record.marks} Marks`,
          });
        }

        if (notification) {
          await notification.writeBestEffort({
            db: tx,
            userId: record.userId,
            category: NOTIFICATION_CATEGORY.PAYMENT,
            severity: NOTIFICATION_SEVERITY.ACTION,
            title: "Payment received",
            body: `Your payment of ${record.amountIdr} IDR was received and ${record.marks} Marks were added to your balance.`,
            eventKey: `payment.${record.id}.credited`,
            emailRequired: true,
          });
        }
      } else {
        // B2: the REFUNDED webhook may race an admin refund. The status
        // update is conditional on the row still being in a credit state
        // (PAID/SETTLED) — if the admin refund already committed, the update
        // is a no-op and the reversal must NOT run again (double refund).
        // The compensation only runs when THIS webhook actually transitioned
        // the row out of a credit state.
        if (input.status === PAYMENT_STATUS.REFUNDED) {
          const reversed = await repo.updatePaymentStatusIfInCreditState(
            record.id,
            {
              status: input.status,
              providerEventId: input.providerEventId,
              failureReason: input.failureReason ?? null,
              providerSuccessAt,
              providerRefundKind: "full",
              providerRefundAmountIdr,
              providerRefundIdentity,
            },
            tx,
          );

          let didReverse = false;
          if (reversed) {
            await kolCommission?.recordSuccessfulKolTopUp(tx, {
              paymentId: record.id,
              providerSuccessTimeStatus,
            });
            // N4: read the wallet through the transaction so the
            // reversal-vs-reconciliation decision uses the transaction's view
            // of the balance (a concurrent wallet change cannot skew it).
            const w = await wallet.getByUserId(tx, record.userId);
            // M1: the credited Marks live in availableBalance only until
            // sessions are booked (moved to heldBalance). A payer may have
            // spent SOME and held the REST, so the reversal basis must be the
            // total (held + available), not available alone — otherwise the
            // compensation is skipped, a reconciliation row is written, and the
            // held marks are later deducted by the tutor AFTER the provider
            // refunded, delivering Marks-backed sessions on a refunded payment.
            // The "spent all" case (H4) is preserved: when total < marks the
            // reversal would throw InsufficientBalanceError inside the tx and
            // roll back the whole webhook (status stays PAID, provider retries
            // forever). Instead we mark REFUNDED, record the mismatch for admin
            // reconciliation (PRD TC-39), and skip the reversal + notification.
            const total = w ? w.heldBalance + w.availableBalance : 0;
            if (w === null || total < record.marks) {
              if (audit) {
                await audit.record({
                  db: tx,
                  actorId: null,
                  actorType: ACTOR_TYPE.SYSTEM,
                  action: "refund_webhook_reconciliation",
                  targetId: record.id,
                  targetType: "payment_record",
                  details: {
                    paymentId: record.id,
                    marks: record.marks,
                    availableBalance: w ? w.availableBalance : 0,
                    heldBalance: w ? w.heldBalance : 0,
                    spent: record.marks - total,
                  },
                });
              }
              if (refundRecord) {
                await refundRecord.insertRefundRecord(tx, {
                  paymentId: record.id,
                  walletId: record.walletId,
                  amountIdr: input.refundAmountIdr ?? record.amountIdr,
                  marks: record.marks,
                  reason:
                    "REFUNDED webhook: marks already spent; manual reconciliation required",
                  providerEventId: input.providerEventId,
                });
              }
            } else {
              // M1: consume held marks first (release them back to available),
              // then reverse the full payment marks from available via
              // compensate_deduct (R5) — total balance is the reversal basis.
              const heldToRelease = Math.min(w!.heldBalance, record.marks);
              if (heldToRelease > 0) {
                await wallet.release(tx, {
                  walletId: record.walletId,
                  amount: heldToRelease,
                  eventKey: `refund.${record.id}.release`,
                  sourceReference: record.id,
                  actorType: "system",
                  reason: "Refund: released held marks before reversal",
                });
              }
              // R5: compensate_deduct removes the marks from the available
              // balance, unlike `deduct` which only releases holds.
              await wallet.compensate(tx, {
                walletId: record.walletId,
                amount: record.marks,
                eventKey: `refund.${record.id}.reverse`,
                sourceReference: record.id,
                actorType: "system",
                reason: "Refund: reversed credited marks",
                type: "compensate_deduct",
              });
              didReverse = true;
            }
          }

          // The refund notification fires only when the reversal actually ran
          // (clean case). The reconciliation case is surfaced via the
          // refundRecord/audit rows for admin, so the payer gets no
          // "Refund processed" notification.
          if (notification && reversed && didReverse) {
            await notification.writeBestEffort({
              db: tx,
              userId: record.userId,
              category: NOTIFICATION_CATEGORY.REFUND,
              severity: NOTIFICATION_SEVERITY.ACTION,
              title: "Refund processed",
              body: "Your payment has been refunded to your account.",
              eventKey: `payment.${record.id}.refunded`,
              emailRequired: true,
            });
          }
        } else {
          // The allowed-transition check leaves only FAILED or EXPIRED here.
          // H3: after a re-purchase the row is reset to PENDING with a NEW
          // providerRequestId (the current attempt's generation). A late
          // FAILED/EXPIRED webhook for the OLD attempt would otherwise flip the
          // PENDING row terminal and the new attempt's SUCCEEDED webhook would
          // hit the early return above and never credit. The stale marker is the
          // previous attempt's providerEventId: if the incoming terminal event
          // carries that same id, it is the old attempt (or a duplicate of it)
          // and must be ignored. Provider event identifiers may differ from
          // provider request identifiers, so compare the persisted event marker.
          // Records without a stale marker fall back to the old behavior.
          if (
            record.status === PAYMENT_STATUS.PENDING &&
            record.providerEventId &&
            input.providerEventId === record.providerEventId
          ) {
            return { status: record.status };
          }
          await repo.updatePaymentStatus(
            record.id,
            {
              status: input.status,
              providerEventId: input.providerEventId,
              failureReason: input.failureReason ?? null,
            },
            tx,
          );
        }
      }

      return { status: input.status };
    });
  }

  /**
   * Fetches a payment record, verifying the requesting user owns it.
   *
   * @param paymentId - the payment to fetch
   * @param userId - the requesting user
   * @returns the payment record
   * @throws {PaymentNotFoundError} if the payment does not exist or belongs to another user
   */
  async function getPurchase(paymentId: string, userId: string) {
    const record = await repo.findPaymentById(paymentId);
    if (!record || record.userId !== userId)
      throw new PaymentNotFoundError(paymentId);
    return record;
  }

  return {
    getTopUpCatalog,
    createTopUpQuote,
    createPurchaseFromTopUpQuote,
    createIntent,
    simulatePurchase,
    reconcilePurchase,
    reconcilePendingPayments,
    confirmFromWebhook,
    getPurchase,
    provider,
  };
}
