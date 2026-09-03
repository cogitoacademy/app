import type { DbType } from "../../lib/db";
import { PAYMENT_STATUS, ACTOR_TYPE } from "../../shared/constants";
import { NOTIFICATION_CATEGORY } from "../../shared/constants";
import { NOTIFICATION_SEVERITY } from "../../shared/constants";
import type { NotificationWriteParams } from "../notification/notification.service";
import {
  PackageNotFoundError,
  PaymentNotFoundError,
  PackageAlreadyPurchasedError,
  PaymentProviderError,
  PaymentSimulationUnavailableError,
} from "./payment.errors";
import type { PaymentWalletPort } from "./index";
import type { PaymentAuditPort } from "./index";
import type { PaymentRefundRecordPort } from "./index";
import type { PaymentRepo } from "./payment.repo";

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
}

export interface PaymentProvider {
  createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{
    checkoutUrl: string;
    // X1: the provider-side payment request id (Xendit `pr-...`), stored on
    // the payment record so admin refunds can initiate a provider refund.
    paymentRequestId?: string | null;
  }>;
  verifyWebhook(rawBody: string, signature: string): Promise<WebhookPayload>;
  /**
   * Initiates a provider-side refund (X1). Returns the provider refund id for
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
  checkoutUrl: string;
}

export interface ConfirmInput {
  provider: string;
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
}

export type PaymentService = ReturnType<typeof createPaymentService>;

export interface PaymentNotificationPort {
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["PAID", "FAILED", "EXPIRED", "SETTLED"],
  PAID: ["SETTLED", "REFUNDED"],
  SETTLED: ["REFUNDED"],
  FAILED: [],
  EXPIRED: [],
  REFUNDED: [],
};

/**
 * A Test Mode simulation can be retried after Xendit has already completed the
 * payment. In that case Xendit rejects the now-consumed dynamic QR with this
 * provider error instead of returning the completed status. The status lookup
 * below is the safe recovery path; other simulation failures must retain their
 * original diagnostics.
 */
function isInactiveSimulationError(error: unknown): boolean {
  return String(error).includes("400 INACTIVE_PAYMENT_METHOD");
}

/**
 * Creates the payment service for purchase intents, webhook confirmation, and purchase lookups.
 *
 * @param deps - the dependency ports (db, wallet, repo, provider, providerName)
 * @returns a PaymentPort with createIntent, confirmFromWebhook, getPurchase and the provider
 */
export function createPaymentService(deps: {
  db: DbType;
  wallet: PaymentWalletPort;
  repo: PaymentRepo;
  provider: PaymentProvider;
  providerName: string;
  notification?: PaymentNotificationPort;
  audit?: PaymentAuditPort;
  refundRecord?: PaymentRefundRecordPort;
}) {
  const {
    db,
    wallet,
    repo,
    provider,
    providerName,
    notification,
    audit,
    refundRecord,
  } = deps;

  /**
   * Creates a payment intent for a mark package purchase, reusing pending intents.
   *
   * @param userId - the purchasing student
   * @param walletId - the student's wallet to credit on confirmation
   * @param packageCode - the mark package code to purchase
   * @returns the payment id, provider reference, and checkout URL
   * @throws {PackageNotFoundError} if the package is missing or inactive
   * @throws {PackageAlreadyPurchasedError} if the user already has a non-pending purchase
   * @throws {PaymentProviderError} if the provider rejects intent creation
   */
  async function createIntent(
    userId: string,
    walletId: string,
    packageCode: string,
  ): Promise<CreateIntentResult> {
    const pkg = await repo.findPackageByCode(packageCode);
    if (!pkg || !pkg.isActive) throw new PackageNotFoundError(packageCode);

    const idempotencyKey = `${providerName}:${userId}:${packageCode}`;
    const existing = await repo.findPaymentByProviderReference(idempotencyKey);
    if (existing) {
      if (existing.status === PAYMENT_STATUS.PENDING) {
        // H4: reuse the persisted checkout URL when available so a PENDING
        // re-purchase does not re-call the provider (payment provider intents
        // are not guaranteed idempotent and would mint a second checkout).
        if (existing.checkoutUrl) {
          return {
            paymentId: existing.id,
            providerReference: existing.providerReference,
            checkoutUrl: existing.checkoutUrl,
          };
        }
        const existingIntent = await provider.createIntent({
          paymentId: existing.id,
          amountIdr: pkg.priceIdr,
          providerReference: existing.providerReference,
        });
        // X1: refresh the provider payment-request id in case it rotated.
        const update: {
          status: string;
          providerRequestId?: string;
          checkoutUrl?: string | null;
        } = { status: PAYMENT_STATUS.PENDING };
        if (existingIntent.paymentRequestId) {
          update.providerRequestId = existingIntent.paymentRequestId;
        }
        update.checkoutUrl = existingIntent.checkoutUrl;
        await repo.updatePaymentStatus(existing.id, update);
        return {
          paymentId: existing.id,
          providerReference: existing.providerReference,
          checkoutUrl: existingIntent.checkoutUrl,
        };
      }
      if (
        existing.status === PAYMENT_STATUS.FAILED ||
        existing.status === PAYMENT_STATUS.EXPIRED
      ) {
        // Reset to PENDING so the webhook can credit, then re-create the intent.
        // Xendit allows reusing the reference_id for a fresh payment request.
        // H3: each re-purchase is a new attempt. We rotate providerRequestId to
        // the new attempt's id but RETAIN the previous providerEventId as the
        // stale-generation marker: confirmFromWebhook ignores any terminal event
        // whose providerEventId equals the retained one, so a late FAILED/EXPIRED
        // for the OLD attempt cannot flip the re-purchased PENDING row terminal.
        // (We cannot match against providerRequestId because Xendit payment
        // events carry payment_id, not payment_request_id.)
        const freshIntent = await provider.createIntent({
          paymentId: existing.id,
          amountIdr: pkg.priceIdr,
          providerReference: existing.providerReference,
        });
        const update: {
          status: string;
          providerRequestId?: string;
          checkoutUrl?: string | null;
        } = { status: PAYMENT_STATUS.PENDING };
        if (freshIntent.paymentRequestId) {
          update.providerRequestId = freshIntent.paymentRequestId;
        }
        update.checkoutUrl = freshIntent.checkoutUrl;
        await repo.updatePaymentStatus(existing.id, update);
        return {
          paymentId: existing.id,
          providerReference: existing.providerReference,
          checkoutUrl: freshIntent.checkoutUrl,
        };
      }
      throw new PackageAlreadyPurchasedError(packageCode, userId);
    }

    const paymentId = crypto.randomUUID();
    const providerReference = idempotencyKey;

    const inserted = await repo.insertPayment({
      id: paymentId,
      userId,
      walletId,
      packageId: pkg.id,
      provider: providerName,
      providerReference,
      amountIdr: pkg.priceIdr,
      marks: pkg.marks,
      status: PAYMENT_STATUS.PENDING,
    });

    // B6: a concurrent request won the check-then-insert race and its row
    // was committed first — reuse the existing (PENDING) payment instead of
    // creating a zombie duplicate.
    if (!inserted) {
      const existingRow =
        await repo.findPaymentByProviderReference(providerReference);
      if (existingRow) {
        if (existingRow.checkoutUrl) {
          return {
            paymentId: existingRow.id,
            providerReference: existingRow.providerReference,
            checkoutUrl: existingRow.checkoutUrl,
          };
        }
        const existingIntent = await provider.createIntent({
          paymentId: existingRow.id,
          amountIdr: pkg.priceIdr,
          providerReference: existingRow.providerReference,
        });
        await repo.updatePaymentStatus(existingRow.id, {
          status: PAYMENT_STATUS.PENDING,
          checkoutUrl: existingIntent.checkoutUrl,
          ...(existingIntent.paymentRequestId
            ? { providerRequestId: existingIntent.paymentRequestId }
            : {}),
        });
        return {
          paymentId: existingRow.id,
          providerReference: existingRow.providerReference,
          checkoutUrl: existingIntent.checkoutUrl,
        };
      }
    }

    try {
      const intent = await provider.createIntent({
        paymentId,
        amountIdr: pkg.priceIdr,
        providerReference,
      });
      // X1: persist the provider payment-request id for provider refunds.
      // H4: persist the checkout URL for PENDING re-purchase reuse.
      const update: {
        status: string;
        providerRequestId?: string;
        checkoutUrl?: string | null;
      } = { status: PAYMENT_STATUS.PENDING };
      if (intent.paymentRequestId) {
        update.providerRequestId = intent.paymentRequestId;
      }
      update.checkoutUrl = intent.checkoutUrl;
      await repo.updatePaymentStatus(paymentId, update);
      return { paymentId, providerReference, checkoutUrl: intent.checkoutUrl };
    } catch (error) {
      await repo.updatePaymentStatus(paymentId, {
        status: PAYMENT_STATUS.EXPIRED,
      });
      throw new PaymentProviderError(providerName, error);
    }
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
        // Xendit includes reference_id on this endpoint, but retain the
        // database reference as a safe fallback if a provider response omits
        // it while still reporting a terminal status.
        providerReference: remote.providerReference || record.providerReference,
      });
    } catch (error) {
      throw new PaymentProviderError(providerName, error);
    }
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
      );

      if (!record) throw new PaymentNotFoundError(input.providerReference);
      // PAID/SETTLED are terminal for idempotency purposes, EXCEPT a REFUNDED
      // webhook (per ALLOWED_TRANSITIONS PAID/SETTLED -> REFUNDED) which must be
      // processed so the payment is marked REFUNDED and the payer is notified.
      if (
        record.status === PAYMENT_STATUS.PAID &&
        input.status !== PAYMENT_STATUS.REFUNDED
      )
        return { status: PAYMENT_STATUS.PAID };
      if (record.status === PAYMENT_STATUS.FAILED)
        return { status: PAYMENT_STATUS.FAILED };
      if (
        record.status === PAYMENT_STATUS.SETTLED &&
        input.status !== PAYMENT_STATUS.REFUNDED
      )
        return { status: PAYMENT_STATUS.SETTLED };
      if (record.status === PAYMENT_STATUS.EXPIRED)
        return { status: PAYMENT_STATUS.EXPIRED };
      if (record.status === PAYMENT_STATUS.REFUNDED)
        return { status: PAYMENT_STATUS.REFUNDED };

      const allowed = ALLOWED_TRANSITIONS[record.status] ?? [];
      if (!allowed.includes(input.status)) {
        return { status: record.status };
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

      const shouldCredit =
        record.status === PAYMENT_STATUS.PENDING &&
        (input.status === PAYMENT_STATUS.PAID ||
          input.status === PAYMENT_STATUS.SETTLED);

      if (
        input.status === PAYMENT_STATUS.PAID ||
        input.status === PAYMENT_STATUS.SETTLED
      ) {
        await repo.updatePaymentStatus(
          record.id,
          {
            status: input.status,
            providerEventId: input.providerEventId,
            receiptUrl: input.receiptUrl ?? null,
          },
          tx,
        );

        if (shouldCredit) {
          await wallet.credit(tx, {
            walletId: record.walletId,
            actorType: "student",
            amount: record.marks,
            eventKey: `purchase.${record.id}`,
            sourceReference: record.id,
            reason: `Purchase: ${record.marks} Marks`,
          });
        }

        if (notification && shouldCredit) {
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
            },
            tx,
          );

          let didReverse = false;
          if (reversed) {
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
                  amountIdr: record.amountIdr,
                  marks: record.marks,
                  reason:
                    "REFUNDED webhook: marks already spent; manual reconciliation required",
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
        } else if (
          input.status === PAYMENT_STATUS.FAILED ||
          input.status === PAYMENT_STATUS.EXPIRED
        ) {
          // H3: after a re-purchase the row is reset to PENDING with a NEW
          // providerRequestId (the current attempt's generation). A late
          // FAILED/EXPIRED webhook for the OLD attempt would otherwise flip the
          // PENDING row terminal and the new attempt's SUCCEEDED webhook would
          // hit the early return above and never credit. The stale marker is the
          // previous attempt's providerEventId: if the incoming terminal event
          // carries that same id, it is the old attempt (or a duplicate of it)
          // and must be ignored. (We cannot compare against providerRequestId
          // because Xendit payment events carry payment_id, not
          // payment_request_id.) Records without a stale marker fall back to the
          // old behavior.
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
    createIntent,
    simulatePurchase,
    reconcilePurchase,
    confirmFromWebhook,
    getPurchase,
    provider,
  };
}
