import type { DbType } from "../../lib/db";
import { PAYMENT_STATUS, ACTOR_TYPE } from "../../shared/constants";
import { NOTIFICATION_CATEGORY } from "../../shared/constants";
import { NOTIFICATION_SEVERITY } from "../../shared/constants";
import type { NotificationWriteParams } from "../notification/notification.service";
import {
  PackageNotFoundError,
  PaymentNotFoundError,
  PaymentProviderError,
  PaymentSimulationUnavailableError,
  PaymentWebhookMismatchError,
} from "./payment.errors";
import type { PaymentWalletPort } from "./index";
import type { PaymentAuditPort } from "./index";
import type { PaymentRefundRecordPort } from "./index";
import {
  recordPaymentIntegrity,
  recordPaymentReconciliation,
} from "../../lib/metrics";
import type { PaymentRepo } from "./payment.repo";
import { lockPaymentIntent } from "../../lib/locks";

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
  checkoutUrl: string;
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
}

export type PaymentService = ReturnType<typeof createPaymentService>;

export interface PaymentNotificationPort {
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["PAID", "FAILED", "EXPIRED", "SETTLED"],
  PAID: ["SETTLED", "REFUNDED"],
  SETTLED: ["REFUNDED"],
  FAILED: ["PAID", "SETTLED"],
  EXPIRED: ["PAID", "SETTLED"],
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
   * Creates a payment intent for a mark package purchase.
   *
   * A current PENDING attempt is reused so retrying the checkout remains
   * idempotent. Once an attempt reaches a terminal state, the next purchase
   * gets a new payment row and provider reference; earlier attempts stay as
   * immutable payment history.
   *
   * @param userId - the purchasing student
   * @param walletId - the student's wallet to credit on confirmation
   * @param packageCode - the mark package code to purchase
   * @returns the payment id, provider reference, and checkout URL
   * @throws {PackageNotFoundError} if the package is missing or inactive
   * @throws {PaymentProviderError} if the provider rejects intent creation
   */
  async function createIntent(
    userId: string,
    walletId: string,
    packageCode: string,
  ): Promise<CreateIntentResult> {
    const pkg = await repo.findPackageByCode(packageCode);
    if (!pkg || !pkg.isActive) throw new PackageNotFoundError(packageCode);

    const pendingAttempt = await repo.findLatestPaymentByUserAndPackage(
      userId,
      pkg.id,
      providerName,
    );
    if (
      pendingAttempt?.status === PAYMENT_STATUS.PENDING &&
      pendingAttempt.providerRequestId &&
      provider.getPaymentRequestStatus
    ) {
      try {
        await reconcilePurchase(pendingAttempt.id, userId);
      } catch (error) {
        // Provider availability is required to prove an attempt is terminal.
        // On lookup failure, preserve idempotency and reuse the pending intent.
        if (
          !(error instanceof PaymentProviderError) &&
          !(error instanceof PaymentNotFoundError)
        ) {
          throw error;
        }
      }
    }

    const baseProviderReference = `${providerName}:${userId}:${packageCode}`;
    // Keep the old reference fallback for rows created before repeat purchases
    // were supported. New rows are selected by their relational keys so an
    // earlier terminal attempt does not become a permanent package lock.
    const outcome = await db.transaction(async (tx) => {
      // B6: unique references prevent duplicate rows; this transaction lock
      // also prevents concurrent callers from POSTing duplicate provider
      // intents before either caller persists its checkout URL.
      await lockPaymentIntent(tx, userId, pkg.id, providerName);

      const existingByPackage = repo.findLatestPaymentByUserAndPackage
        ? await repo.findLatestPaymentByUserAndPackage(
            userId,
            pkg.id,
            providerName,
            tx,
          )
        : null;
      const existing =
        existingByPackage ??
        (await repo.findPaymentByProviderReference(baseProviderReference, tx));

      const persistIntent = async (
        paymentId: string,
        providerReference: string,
      ) => {
        const intent = await provider.createIntent({
          paymentId,
          amountIdr: pkg.priceIdr,
          providerReference,
        });
        const update: {
          status: string;
          providerRequestId?: string;
          checkoutUrl?: string | null;
        } = {
          status: PAYMENT_STATUS.PENDING,
          checkoutUrl: intent.checkoutUrl,
        };
        if (intent.paymentRequestId) {
          update.providerRequestId = intent.paymentRequestId;
        }
        await repo.updatePaymentStatus(paymentId, update, tx);
        return {
          paymentId,
          providerReference,
          checkoutUrl: intent.checkoutUrl,
        };
      };

      if (existing?.status === PAYMENT_STATUS.PENDING) {
        // H4: reuse persisted checkout URL; provider intents are not
        // guaranteed idempotent.
        if (existing.checkoutUrl) {
          return {
            ok: true as const,
            value: {
              paymentId: existing.id,
              providerReference: existing.providerReference,
              checkoutUrl: existing.checkoutUrl,
            },
          };
        }
        try {
          return {
            ok: true as const,
            value: await persistIntent(existing.id, existing.providerReference),
          };
        } catch (error) {
          await repo.updatePaymentStatus(
            existing.id,
            { status: PAYMENT_STATUS.EXPIRED },
            tx,
          );
          return { ok: false as const, error };
        }
      }

      // PAID, SETTLED, FAILED, EXPIRED, and REFUNDED are historical outcomes,
      // not package-level locks. Each retry gets independent webhook and
      // wallet-credit idempotency history.
      const paymentId = crypto.randomUUID();
      const providerReference = existing
        ? `${baseProviderReference}:${paymentId}`
        : baseProviderReference;
      const inserted = await repo.insertPayment(
        {
          id: paymentId,
          userId,
          walletId,
          packageId: pkg.id,
          provider: providerName,
          providerReference,
          amountIdr: pkg.priceIdr,
          marks: pkg.marks,
          status: PAYMENT_STATUS.PENDING,
        },
        tx,
      );

      // Keep conflict recovery for callers using older repository behavior.
      if (inserted === null) {
        const existingRow = await repo.findPaymentByProviderReference(
          providerReference,
          tx,
        );
        if (existingRow) {
          if (existingRow.checkoutUrl) {
            return {
              ok: true as const,
              value: {
                paymentId: existingRow.id,
                providerReference: existingRow.providerReference,
                checkoutUrl: existingRow.checkoutUrl,
              },
            };
          }
          try {
            return {
              ok: true as const,
              value: await persistIntent(
                existingRow.id,
                existingRow.providerReference,
              ),
            };
          } catch (error) {
            await repo.updatePaymentStatus(
              existingRow.id,
              { status: PAYMENT_STATUS.EXPIRED },
              tx,
            );
            return { ok: false as const, error };
          }
        }
      }

      try {
        return {
          ok: true as const,
          value: await persistIntent(paymentId, providerReference),
        };
      } catch (error) {
        await repo.updatePaymentStatus(
          paymentId,
          { status: PAYMENT_STATUS.EXPIRED },
          tx,
        );
        return { ok: false as const, error };
      }
    });

    if (!outcome.ok) {
      throw new PaymentProviderError(providerName, outcome.error);
    }
    return outcome.value;
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
      );

      if (!record) throw new PaymentNotFoundError(input.providerReference);
      if (record.provider && record.provider !== input.provider) {
        if (providerName === "midtrans")
          recordPaymentIntegrity("midtrans", "provider_mismatch");
        throw new PaymentWebhookMismatchError("Payment provider mismatch");
      }
      if (input.currency !== undefined && input.currency !== "IDR") {
        if (providerName === "midtrans")
          recordPaymentIntegrity("midtrans", "currency_mismatch");
        throw new PaymentWebhookMismatchError("Payment currency mismatch");
      }
      if (
        input.amountIdr !== undefined &&
        input.amountIdr !== record.amountIdr
      ) {
        if (providerName === "midtrans")
          recordPaymentIntegrity("midtrans", "amount_mismatch");
        throw new PaymentWebhookMismatchError("Payment amount mismatch");
      }

      if (input.refundKind === "partial") {
        if (providerName === "midtrans")
          recordPaymentIntegrity("midtrans", "partial_refund");
        if (audit) {
          await audit.record({
            db: tx,
            actorId: null,
            actorType: ACTOR_TYPE.SYSTEM,
            action: "partial_refund_reconciliation",
            targetId: record.id,
            targetType: "payment_record",
            details: {
              paymentId: record.id,
              providerEventId: input.providerEventId,
              amountIdr: input.amountIdr,
              refundAmountIdr: input.refundAmountIdr,
            },
          });
        }
        if (refundRecord) {
          await refundRecord.insertRefundRecord(tx, {
            paymentId: record.id,
            walletId: record.walletId,
            amountIdr: input.refundAmountIdr ?? 0,
            marks: 0,
            reason:
              "Provider partial refund: manual Marks reconciliation required",
            providerEventId: input.providerEventId,
          });
        }
        return { status: record.status };
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
        input.status !== PAYMENT_STATUS.SETTLED
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
        input.status !== PAYMENT_STATUS.SETTLED
      )
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
        record.status !== PAYMENT_STATUS.PAID &&
        record.status !== PAYMENT_STATUS.SETTLED &&
        record.status !== PAYMENT_STATUS.REFUNDED &&
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
    createIntent,
    simulatePurchase,
    reconcilePurchase,
    reconcilePendingPayments,
    confirmFromWebhook,
    getPurchase,
    provider,
  };
}
