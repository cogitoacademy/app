import { createAdminClassCancellation } from "./class-enrollment.admin-cancellation";
import { createAdminClassSessionCancellation } from "./class-enrollment.admin-session-cancellation";
import { createClassMinimumLifecycle } from "./class-enrollment.minimum";
import { createClassSessionReportService } from "./class-enrollment.reports";
import { quoteEnrollmentCancellation } from "./class-enrollment.cancellation";
import {
  classEnrollmentCancellationOutput,
  type classEnrollmentCancellationInput,
  type confirmClassEnrollmentCancellationInput,
} from "./class-enrollment.types";
import { randomUUID } from "node:crypto";
import { academyClassEnrollment } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { log } from "../../lib/logger";
import type { NotificationService } from "../notification/notification.service";
import type { PaymentService } from "../payment/payment.service";
import type { WalletService } from "../wallet/wallet.service";
import {
  ClassEnrollmentConflictError,
  ClassEnrollmentInvalidOperationError,
  ClassEnrollmentNotFoundError,
} from "./class-enrollment.errors";
import { createClassEnrollmentRepo } from "./class-enrollment.repo";
import {
  InvalidEnrollmentQuoteError,
  quoteClassEnrollment,
} from "./enrollment.pricing";
import type {
  classEnrollmentTopUpQuoteInput,
  classEnrollmentTopUpPurchaseInput,
  createClassEnrollmentInput,
} from "./class-enrollment.types";
import type { z } from "zod";

const CHECKOUT_TTL_MS = 15 * 60 * 1000;
const ACTIVE_ALLOCATION_STATES = [
  "checkout_reserved",
  "unfunded_reserved",
  "funded",
] as const;

type CreateInput = z.infer<typeof createClassEnrollmentInput>;
type TopUpQuoteInput = z.infer<typeof classEnrollmentTopUpQuoteInput>;
type TopUpPurchaseInput = z.infer<typeof classEnrollmentTopUpPurchaseInput>;
type TopUpChoice = "package" | "custom" | "recommended";

function reminderDate(dueAt: Date, daysBefore: number) {
  return new Date(dueAt.getTime() - daysBefore * 24 * 60 * 60 * 1000);
}

function formatDueAt(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function safeRequestedChoice(value: string): TopUpChoice | null {
  return value === "package" || value === "custom" || value === "recommended"
    ? value
    : null;
}

function matchesInstallmentAmount(
  installment: { rateMarks: number; sessionCount: number; amountMarks: number },
  allocations: readonly { rateMarks: number }[],
) {
  return (
    allocations.length === installment.sessionCount &&
    allocations.every(
      (allocation) => allocation.rateMarks === installment.rateMarks,
    ) &&
    allocations.reduce(
      (total, allocation) => total + allocation.rateMarks,
      0,
    ) === installment.amountMarks
  );
}

export function createClassEnrollmentService(deps: {
  db: DbType;
  wallet: Pick<WalletService, "hold" | "getOrCreate" | "release" | "deduct">;
  payment: Pick<
    PaymentService,
    "createTopUpQuote" | "createPurchaseFromTopUpQuote"
  >;
  notification: Pick<NotificationService, "write">;
  appBaseUrl: string;
  clock?: () => Date;
}) {
  const repo = createClassEnrollmentRepo();
  const adminCancellation = createAdminClassCancellation(deps);
  const adminSessionCancellation = createAdminClassSessionCancellation(deps);
  const minimumLifecycle = createClassMinimumLifecycle(deps);
  const sessionReports = createClassSessionReportService(deps);
  const now = () => deps.clock?.() ?? new Date();

  function currentTime() {
    return now();
  }

  function mapRecords(
    records: Awaited<ReturnType<typeof repo.findStudentClassRecords>>,
  ) {
    return records.enrollments.map((enrollment) => ({
      id: enrollment.id,
      plan: enrollment.plan as "full" | "half" | "single" | "masterclass",
      state: enrollment.state as
        | "checkout_pending"
        | "active"
        | "expired"
        | "cancelled",
      sessionCount: enrollment.sessionCount,
      firstRateMarks: enrollment.firstRateMarks,
      secondRateMarks: enrollment.secondRateMarks,
      firstInstallmentMarks: enrollment.firstInstallmentMarks,
      secondInstallmentMarks: enrollment.secondInstallmentMarks,
      totalMarks: enrollment.totalMarks,
      checkoutExpiresAt: enrollment.checkoutExpiresAt,
      createdAt: enrollment.createdAt,
      installments: records.installments
        .filter((installment) => installment.enrollmentId === enrollment.id)
        .map((installment) => ({
          id: installment.id,
          ordinal: installment.ordinal as 1 | 2,
          rateMarks: installment.rateMarks,
          sessionCount: installment.sessionCount,
          amountMarks: installment.amountMarks,
          state: installment.state as
            | "checkout_pending"
            | "pending"
            | "funded"
            | "defaulted"
            | "expired"
            | "cancelled",
          dueAt: installment.dueAt,
          checkoutExpiresAt: installment.checkoutExpiresAt,
          fundedAt: installment.fundedAt,
        })),
      allocations: records.allocations
        .filter((allocation) => allocation.enrollmentId === enrollment.id)
        .map((allocation) => ({
          sessionId: allocation.sessionId,
          ordinal: allocation.ordinal,
          sequenceNumber: allocation.sequenceNumber,
          rateMarks: allocation.rateMarks,
          state: allocation.state as
            | "checkout_reserved"
            | "unfunded_reserved"
            | "funded"
            | "released",
          fundedMarks: allocation.fundedMarks,
          spentMarks: allocation.spentMarks,
          releasedMarks: allocation.releasedMarks,
        })),
    }));
  }

  async function findOwnedEnrollmentState(
    conn: DbOrTx,
    studentId: string,
    classId: string,
    nowAt: Date,
    expireStale = true,
  ) {
    const classRecord = await repo.getClassForEnrollment(conn, classId);
    if (!classRecord) throw new ClassEnrollmentNotFoundError();
    if (!["published", "postponed"].includes(classRecord.state)) {
      const records = await repo.findStudentClassRecords(
        conn,
        studentId,
        classId,
      );
      if (!records.enrollments.length) throw new ClassEnrollmentNotFoundError();
      return {
        classId,
        classState: classRecord.state as
          | "draft"
          | "published"
          | "postponed"
          | "cancelled"
          | "completed",
        freeExitUntil: classRecord.freeExitUntil,
        eligibleSessions: [],
        enrollments: mapRecords(records),
      };
    }
    if (classRecord.state === "postponed") {
      const records = await repo.findStudentClassRecords(
        conn,
        studentId,
        classId,
      );
      return {
        classId,
        classState: classRecord.state as
          | "draft"
          | "published"
          | "postponed"
          | "cancelled"
          | "completed",
        freeExitUntil: classRecord.freeExitUntil,
        eligibleSessions: [],
        enrollments: mapRecords(records),
      };
    }
    if (expireStale) {
      await repo.expireStaleCheckoutForStudentClass(
        conn,
        studentId,
        classId,
        nowAt,
      );
    }
    const [records, eligibleSessions] = await Promise.all([
      repo.findStudentClassRecords(conn, studentId, classId),
      repo.listAvailableSessions(conn, classId, studentId, nowAt),
    ]);
    return {
      classId,
      classState: classRecord.state as
        | "draft"
        | "published"
        | "postponed"
        | "cancelled"
        | "completed",
      freeExitUntil: classRecord.freeExitUntil,
      eligibleSessions,
      enrollments: mapRecords(records),
    };
  }

  async function getMyClassEnrollments(studentId: string, classId: string) {
    const nowAt = currentTime();
    return deps.db.transaction((tx) =>
      findOwnedEnrollmentState(tx, studentId, classId, nowAt),
    );
  }

  function assertPlanIsAllowed(
    records: Awaited<ReturnType<typeof repo.findStudentClassRecords>>,
    plan: CreateInput["plan"],
  ) {
    if (records.enrollments.some((item) => item.state === "checkout_pending")) {
      throw new ClassEnrollmentConflictError(
        "Finish or let the existing 15-minute class checkout expire before enrolling again",
      );
    }
    const active = records.enrollments.filter(
      (item) => item.state === "active",
    );
    const hasDefaultedHalf = active.some(
      (enrollment) =>
        enrollment.plan === "half" &&
        records.installments.some(
          (installment) =>
            installment.enrollmentId === enrollment.id &&
            installment.ordinal === 2 &&
            installment.state === "defaulted",
        ),
    );
    const hasOtherActivePlan = active.some(
      (enrollment) =>
        enrollment.plan !== "single" && enrollment.plan !== "half",
    );
    const hasActiveHalf = active.some(
      (enrollment) => enrollment.plan === "half",
    );
    const hasActiveSingle = active.some(
      (enrollment) => enrollment.plan === "single",
    );

    if (hasOtherActivePlan) {
      throw new ClassEnrollmentConflictError(
        "This class already has an active enrollment for you",
      );
    }
    if (hasDefaultedHalf) {
      if (plan !== "half" || hasActiveSingle) {
        throw new ClassEnrollmentConflictError(
          "After a missed second installment, rejoin with a new half-plan quote for future sessions",
        );
      }
      return;
    }
    if (hasActiveHalf) {
      throw new ClassEnrollmentConflictError(
        "This half-plan enrollment already owns its selected sessions",
      );
    }
    if (hasActiveSingle && plan !== "single") {
      throw new ClassEnrollmentConflictError(
        "An individual-session enrollment cannot be switched to another plan",
      );
    }
  }

  async function createEnrollment(studentId: string, input: CreateInput) {
    let nowAt = currentTime();
    return deps.db.transaction(async (tx) => {
      await repo.lockEnrollmentRequestKey(tx, studentId, input.requestKey);
      const existing = await repo.findEnrollmentByRequestKey(
        tx,
        studentId,
        input.requestKey,
      );
      if (existing) {
        const existingAllocations = await repo.findAllocations(tx, existing.id);
        await repo.lockSessions(
          tx,
          existingAllocations.map((allocation) => allocation.sessionId),
        );
        const lockedExisting = await repo.findEnrollmentByRequestKey(
          tx,
          studentId,
          input.requestKey,
          true,
        );
        if (!lockedExisting) throw new ClassEnrollmentNotFoundError();
        nowAt = currentTime();
        const sameRequest =
          lockedExisting.classId === input.classId &&
          lockedExisting.plan === input.plan &&
          (input.plan !== "single" ||
            existingAllocations.some(
              (allocation) => allocation.sessionId === input.sessionId,
            ));
        if (!sameRequest) {
          throw new ClassEnrollmentConflictError(
            "This request key already belongs to a different enrollment quote",
          );
        }
        if (
          lockedExisting.state === "checkout_pending" &&
          lockedExisting.checkoutExpiresAt !== null &&
          lockedExisting.checkoutExpiresAt <= nowAt
        ) {
          await repo.releaseCheckout(tx, lockedExisting.id, nowAt);
        }
        const state = await findOwnedEnrollmentState(
          tx,
          studentId,
          input.classId,
          nowAt,
          false,
        );
        const summary = state.enrollments.find(
          (item) => item.id === lockedExisting.id,
        );
        if (!summary) throw new ClassEnrollmentNotFoundError();
        const balance = await repo.getWalletByUser(tx, studentId);
        const shortfallMarks =
          summary.state === "checkout_pending"
            ? Math.max(
                0,
                summary.firstInstallmentMarks -
                  (balance?.availableBalance ?? 0),
              )
            : 0;
        return {
          ...summary,
          outcome: "already_exists" as const,
          availableMarks: balance?.availableBalance ?? 0,
          shortfallMarks,
        };
      }

      const classRecord = await repo.getClassForEnrollment(
        tx,
        input.classId,
        true,
      );
      if (!classRecord || classRecord.state !== "published") {
        throw new ClassEnrollmentNotFoundError();
      }
      if (classRecord.kind !== "cohort" && classRecord.kind !== "masterclass") {
        throw new ClassEnrollmentInvalidOperationError(
          "This class is not open for enrollment",
        );
      }

      await repo.expireStaleCheckoutForStudentClass(
        tx,
        studentId,
        input.classId,
        nowAt,
      );

      const initialRecords = await repo.findStudentClassRecords(
        tx,
        studentId,
        input.classId,
      );
      assertPlanIsAllowed(initialRecords, input.plan);
      const alreadyEntitled = new Set(
        initialRecords.allocations
          .filter((item) =>
            ACTIVE_ALLOCATION_STATES.some((state) => state === item.state),
          )
          .map((item) => item.sessionId),
      );
      const candidates = (
        await repo.listClassSessions(tx, input.classId)
      ).filter((session) => !alreadyEntitled.has(session.id));

      let quote: ReturnType<typeof quoteClassEnrollment>;
      try {
        quote = quoteClassEnrollment({
          kind: classRecord.kind,
          plan: input.plan,
          sessionId: input.sessionId,
          rates: classRecord,
          sessions: candidates,
          now: nowAt,
        });
      } catch (error) {
        if (error instanceof InvalidEnrollmentQuoteError) {
          throw new ClassEnrollmentInvalidOperationError(error.message);
        }
        throw error;
      }

      const lockedSessions = await repo.lockSessions(
        tx,
        quote.selectedSessionIds,
      );
      nowAt = currentTime();
      if (
        lockedSessions.length !== quote.selectedSessionIds.length ||
        lockedSessions.some(
          (session) =>
            session.classId !== input.classId ||
            session.state !== "scheduled" ||
            session.startAt <= nowAt,
        )
      ) {
        throw new ClassEnrollmentConflictError(
          "One or more selected sessions changed; refresh the class and try again",
        );
      }

      const retry = await repo.findEnrollmentByRequestKey(
        tx,
        studentId,
        input.requestKey,
        true,
      );
      if (retry) {
        const allocations = await repo.findAllocations(tx, retry.id, true);
        const sameRequest =
          retry.classId === input.classId &&
          retry.plan === input.plan &&
          (input.plan !== "single" ||
            allocations.some((item) => item.sessionId === input.sessionId));
        if (!sameRequest) {
          throw new ClassEnrollmentConflictError(
            "This request key already belongs to a different enrollment quote",
          );
        }
        const state = await findOwnedEnrollmentState(
          tx,
          studentId,
          input.classId,
          nowAt,
        );
        const summary = state.enrollments.find((item) => item.id === retry.id);
        if (!summary) throw new ClassEnrollmentNotFoundError();
        const balance = await repo.getWalletByUser(tx, studentId);
        return {
          ...summary,
          outcome: "already_exists" as const,
          availableMarks: balance?.availableBalance ?? 0,
          shortfallMarks:
            summary.state === "checkout_pending"
              ? Math.max(
                  0,
                  summary.firstInstallmentMarks -
                    (balance?.availableBalance ?? 0),
                )
              : 0,
        };
      }

      await repo.expireStaleCheckoutsForSessions(
        tx,
        quote.selectedSessionIds,
        nowAt,
      );
      const currentRecords = await repo.findStudentClassRecords(
        tx,
        studentId,
        input.classId,
      );
      assertPlanIsAllowed(currentRecords, input.plan);
      const overlap = await repo.findBlockingAllocationForSessions(
        tx,
        studentId,
        quote.selectedSessionIds,
      );
      if (overlap.length > 0) {
        throw new ClassEnrollmentConflictError(
          "You already have an entitlement to one or more selected sessions",
        );
      }
      for (const session of lockedSessions) {
        const used = await repo.countBlockingSeats(tx, session.id);
        if (used >= session.capacity) {
          throw new ClassEnrollmentConflictError(
            "One or more selected sessions no longer has an available seat",
            { sessionId: session.id },
          );
        }
      }

      const checkoutExpiresAt = new Date(nowAt.getTime() + CHECKOUT_TTL_MS);
      const enrollmentId = randomUUID();
      const installmentIdByOrdinal = new Map<number, string>();
      for (const installment of quote.installments) {
        installmentIdByOrdinal.set(installment.ordinal, randomUUID());
      }
      const enrollmentValues = {
        id: enrollmentId,
        classId: input.classId,
        studentId,
        requestKey: input.requestKey,
        plan: quote.plan,
        state: "checkout_pending",
        sessionCount: quote.sessionCount,
        firstRateMarks: quote.firstRateMarks,
        secondRateMarks: quote.secondRateMarks,
        firstInstallmentMarks: quote.firstInstallmentMarks,
        secondInstallmentMarks: quote.secondInstallmentMarks,
        totalMarks: quote.totalMarks,
        checkoutExpiresAt,
        createdAt: nowAt,
        updatedAt: nowAt,
      } as const;
      await repo.insertEnrollment(tx, enrollmentValues);

      const installmentValues = quote.installments.map((installment) => {
        const id = installmentIdByOrdinal.get(installment.ordinal)!;
        const dueSessionId = installment.dueAt
          ? installment.sessionIds[0]!
          : null;
        return {
          id,
          enrollmentId,
          ordinal: installment.ordinal,
          rateMarks: installment.rateMarks,
          sessionCount: installment.sessionIds.length,
          amountMarks: installment.amountMarks,
          state: installment.ordinal === 1 ? "checkout_pending" : "pending",
          dueSessionId,
          dueAt: installment.dueAt,
          checkoutExpiresAt:
            installment.ordinal === 1 ? checkoutExpiresAt : null,
          fundedAt: null,
          createdAt: nowAt,
          updatedAt: nowAt,
        };
      });
      await repo.insertInstallments(tx, installmentValues);

      const allocations = quote.allocations.map((allocation) => {
        const allocationId = randomUUID();
        return {
          id: allocationId,
          enrollmentId,
          installmentId: installmentIdByOrdinal.get(
            allocation.installmentOrdinal,
          )!,
          classId: input.classId,
          sessionId: allocation.sessionId,
          studentId,
          ordinal: allocation.ordinal,
          sequenceNumber: allocation.sequenceNumber,
          rateMarks: allocation.rateMarks,
          state: "checkout_reserved" as const,
          fundingEventKey: `class-enrollment:${enrollmentId}:session:${allocation.sessionId}:hold:v1`,
          fundingSourceReference: `academy-class-enrollment/${enrollmentId}/allocation/${allocationId}`,
          fundedMarks: 0,
          spentMarks: 0,
          releasedMarks: 0,
          fundedAt: null,
          createdAt: nowAt,
          updatedAt: nowAt,
        };
      });
      await repo.insertAllocations(tx, allocations);

      const firstInstallmentId = installmentIdByOrdinal.get(1)!;
      const firstInstallment = installmentValues.find(
        (installment) => installment.ordinal === 1,
      )!;
      const firstAllocations = (
        await repo.findAllocations(tx, enrollmentId, true)
      ).filter((allocation) => allocation.installmentId === firstInstallmentId);
      if (!matchesInstallmentAmount(firstInstallment, firstAllocations)) {
        throw new ClassEnrollmentConflictError(
          "The first installment session reservations changed before checkout",
        );
      }
      const wallet = await repo.getWalletByUser(tx, studentId, true);
      const availableMarks = wallet?.availableBalance ?? 0;
      const hasEnoughMarks =
        wallet !== null && availableMarks >= quote.firstInstallmentMarks;

      if (hasEnoughMarks && wallet) {
        if (
          firstAllocations.some(
            (allocation) => allocation.state !== "checkout_reserved",
          )
        ) {
          throw new ClassEnrollmentConflictError(
            "The first installment no longer owns all of its reserved sessions",
          );
        }
        for (const allocation of firstAllocations) {
          await deps.wallet.hold(tx, {
            walletId: wallet.id,
            amount: allocation.rateMarks,
            eventKey: allocation.fundingEventKey,
            sourceReference: allocation.fundingSourceReference,
            actorType: "student",
            reason: `Class enrollment ${enrollmentId}, session ${allocation.sessionId}`,
          });
        }
        const markedFunded = await repo.markInstallmentFunded(
          tx,
          firstInstallmentId,
          firstAllocations.length,
          nowAt,
        );
        if (!markedFunded) {
          throw new ClassEnrollmentConflictError(
            "The first installment changed while it was being funded",
          );
        }
        await repo.markUnfundedInstallmentsReserved(tx, enrollmentId, nowAt);
        const activated = await repo.activateEnrollmentFromCheckout(
          tx,
          enrollmentId,
          firstInstallmentId,
          nowAt,
        );
        if (!activated) {
          throw new ClassEnrollmentConflictError(
            "The class checkout changed while it was being funded",
          );
        }
      }

      const state = await findOwnedEnrollmentState(
        tx,
        studentId,
        input.classId,
        nowAt,
        false,
      );
      const summary = state.enrollments.find(
        (item) => item.id === enrollmentId,
      );
      if (!summary) throw new ClassEnrollmentNotFoundError();
      return {
        ...summary,
        outcome: hasEnoughMarks
          ? ("confirmed" as const)
          : ("checkout_pending" as const),
        availableMarks: hasEnoughMarks
          ? availableMarks - quote.firstInstallmentMarks
          : availableMarks,
        shortfallMarks: hasEnoughMarks
          ? 0
          : quote.firstInstallmentMarks - availableMarks,
      };
    });
  }

  async function cancelEnrollment(
    studentId: string,
    input: z.infer<typeof classEnrollmentCancellationInput>,
    confirmation?: z.infer<typeof confirmClassEnrollmentCancellationInput>,
  ) {
    const initial = await repo.findEnrollment(
      deps.db,
      studentId,
      input.enrollmentId,
    );
    if (!initial) throw new ClassEnrollmentNotFoundError();
    const initialAllocations = await repo.findAllocations(deps.db, initial.id);
    return deps.db.transaction(async (tx) => {
      // Same order as checkout and installment payment: sessions, enrollment,
      // installments, allocations, wallet. Read the clock only after locks.
      const sessions = await repo.lockSessions(
        tx,
        initialAllocations.map((row) => row.sessionId),
      );
      const enrollment = await repo.findEnrollment(
        tx,
        studentId,
        initial.id,
        true,
      );
      if (!enrollment) throw new ClassEnrollmentNotFoundError();
      await repo.findInstallments(tx, enrollment.id, true);
      const allocations = await repo.findAllocations(tx, enrollment.id, true);
      if (confirmation) {
        const receipt = await repo.findCancellationReceipt(
          tx,
          enrollment.id,
          confirmation.requestKey,
        );
        if (receipt) {
          const saved = classEnrollmentCancellationOutput.parse(receipt.quote);
          if (
            saved.quoteVersion !== confirmation.quoteVersion ||
            saved.sessionId !== (input.sessionId ?? null)
          ) {
            throw new ClassEnrollmentConflictError(
              "This cancellation request key was already used for another quote",
            );
          }
          return saved;
        }
      }
      if (enrollment.state !== "active") {
        throw new ClassEnrollmentInvalidOperationError(
          "Only an active enrollment can be cancelled or withdrawn",
        );
      }
      const nowAt = currentTime();
      const classRecord = await repo.getClassForEnrollment(
        tx,
        enrollment.classId,
      );
      const quote = quoteEnrollmentCancellation(
        enrollment.id,
        allocations,
        sessions,
        nowAt,
        input.sessionId,
        classRecord?.state === "postponed" ? classRecord.freeExitUntil : null,
      );
      if (!quote.allocations.length && !quote.unpaidAllocationIds.length) {
        throw new ClassEnrollmentInvalidOperationError(
          "No cancellable future seats remain. Funded seats inside 24 hours stay held for session completion; no Marks were changed",
        );
      }
      if (!confirmation) return quote;
      if (confirmation.quoteVersion !== quote.quoteVersion) {
        throw new ClassEnrollmentConflictError(
          "The cancellation amount or deadline changed; review a fresh quote before confirming",
        );
      }
      const wallet = await repo.getWalletByUser(tx, studentId, true);
      if (!wallet && (quote.feeMarks || quote.returnMarks))
        throw new ClassEnrollmentConflictError(
          "Enrollment wallet is unavailable",
        );
      for (const item of quote.allocations) {
        const funding = allocations.find(
          (row) => row.id === item.allocationId,
        )!;
        const common = {
          walletId: wallet!.id,
          sourceReference: funding.fundingSourceReference,
          actorType: "student" as const,
          reason: `Class ${quote.scope}: ${enrollment.id}`,
        };
        if (item.chargeMarks > 0)
          await deps.wallet.deduct(tx, {
            ...common,
            amount: item.chargeMarks,
            eventKey: `class-allocation:${funding.id}:cancel:charge`,
          });
        if (item.returnMarks > 0)
          await deps.wallet.release(tx, {
            ...common,
            amount: item.returnMarks,
            eventKey: `class-allocation:${funding.id}:cancel:return`,
          });
      }
      await repo.saveCancellation(
        tx,
        studentId,
        quote,
        confirmation.requestKey,
        allocations,
        nowAt,
      );
      await deps.notification.write({
        db: tx,
        userId: studentId,
        category: "refund",
        title:
          quote.scope === "withdrawal"
            ? "Class withdrawal confirmed"
            : "Class seat cancelled",
        body: `${quote.returnMarks} Marks returned to your available balance; ${quote.feeMarks} Marks cancellation fee. This is not a cash refund. ${quote.retainedMarks} Marks remain held for sessions inside the cancellation deadline.`,
        eventKey: `class-enrollment:${enrollment.id}:cancel:${confirmation.requestKey}`,
        metadata: {
          enrollmentId: enrollment.id,
          quoteVersion: quote.quoteVersion,
        },
      });
      return quote;
    });
  }

  async function completeCheckout(studentId: string, enrollmentId: string) {
    const initial = await repo.findEnrollment(deps.db, studentId, enrollmentId);
    if (!initial) throw new ClassEnrollmentNotFoundError();
    const sessionIds = (await repo.findAllocations(deps.db, enrollmentId))
      .filter((allocation) => allocation.state !== "released")
      .map((allocation) => allocation.sessionId);

    return deps.db.transaction(async (tx) => {
      const lockedSessions = await repo.lockSessions(tx, sessionIds);
      const enrollment = await repo.findEnrollment(
        tx,
        studentId,
        enrollmentId,
        true,
      );
      if (!enrollment) throw new ClassEnrollmentNotFoundError();
      const installments = await repo.findInstallments(tx, enrollmentId, true);
      const first = installments.find((item) => item.ordinal === 1);
      if (!first) throw new ClassEnrollmentNotFoundError();
      const nowAt = currentTime();

      if (enrollment.state === "active") {
        const wallet = await repo.getWalletByUser(tx, studentId);
        return thisPaymentSummary(
          tx,
          enrollment,
          "funded",
          0,
          wallet?.availableBalance ?? 0,
        );
      }
      if (enrollment.state !== "checkout_pending") {
        return thisPaymentSummary(tx, enrollment, "expired", 0);
      }
      if (
        !enrollment.checkoutExpiresAt ||
        enrollment.checkoutExpiresAt <= nowAt
      ) {
        await repo.releaseCheckout(tx, enrollmentId, nowAt);
        const expired = await repo.findEnrollment(tx, studentId, enrollmentId);
        if (!expired) throw new ClassEnrollmentNotFoundError();
        return thisPaymentSummary(tx, expired, "expired", 0);
      }

      const classRecord = await repo.getClassForEnrollment(
        tx,
        enrollment.classId,
      );
      if (
        !classRecord ||
        !["published", "postponed"].includes(classRecord.state)
      ) {
        throw new ClassEnrollmentConflictError(
          "This class is not accepting checkout confirmation",
        );
      }
      if (
        lockedSessions.length !== sessionIds.length ||
        lockedSessions.some(
          (session) =>
            session.state !== "scheduled" || session.startAt <= nowAt,
        )
      ) {
        throw new ClassEnrollmentConflictError(
          "One or more reserved sessions are no longer scheduled in the future; request a fresh enrollment",
        );
      }
      const firstAllocations = (
        await repo.findAllocations(tx, enrollmentId, true)
      ).filter(
        (allocation) =>
          allocation.installmentId === first.id &&
          allocation.state !== "released",
      );
      if (
        !matchesInstallmentAmount(first, firstAllocations) ||
        firstAllocations.some(
          (allocation) => allocation.state !== "checkout_reserved",
        )
      ) {
        throw new ClassEnrollmentConflictError(
          "The first installment no longer owns all of its reserved sessions",
        );
      }
      const wallet = await repo.getWalletByUser(tx, studentId, true);
      const availableMarks = wallet?.availableBalance ?? 0;
      const shortfallMarks = Math.max(0, first.amountMarks - availableMarks);
      if (shortfallMarks > 0 || !wallet) {
        return thisPaymentSummary(
          tx,
          enrollment,
          "insufficient",
          shortfallMarks || first.amountMarks,
          availableMarks,
        );
      }
      for (const allocation of firstAllocations) {
        await deps.wallet.hold(tx, {
          walletId: wallet.id,
          amount: allocation.rateMarks,
          eventKey: allocation.fundingEventKey,
          sourceReference: allocation.fundingSourceReference,
          actorType: "student",
          reason: `Class enrollment ${enrollmentId}, session ${allocation.sessionId}`,
        });
      }
      const markedFunded = await repo.markInstallmentFunded(
        tx,
        first.id,
        firstAllocations.length,
        nowAt,
      );
      if (!markedFunded) {
        throw new ClassEnrollmentConflictError(
          "The first installment changed while it was being funded",
        );
      }
      await repo.markUnfundedInstallmentsReserved(tx, enrollmentId, nowAt);
      const activated = await repo.activateEnrollmentFromCheckout(
        tx,
        enrollmentId,
        first.id,
        nowAt,
      );
      if (!activated) {
        throw new ClassEnrollmentConflictError(
          "The class checkout changed while it was being funded",
        );
      }
      const funded = await repo.findEnrollment(tx, studentId, enrollmentId);
      if (!funded) throw new ClassEnrollmentNotFoundError();
      return thisPaymentSummary(
        tx,
        funded,
        "funded",
        0,
        availableMarks - first.amountMarks,
      );
    });
  }

  async function paySecondInstallment(studentId: string, enrollmentId: string) {
    const initial = await repo.findEnrollment(deps.db, studentId, enrollmentId);
    if (!initial) throw new ClassEnrollmentNotFoundError();
    const allocationRows = await repo.findAllocations(deps.db, enrollmentId);
    const sessionIds = allocationRows
      .filter((allocation) => allocation.state !== "released")
      .map((allocation) => allocation.sessionId);

    return deps.db.transaction(async (tx) => {
      const lockedSessions = await repo.lockSessions(tx, sessionIds);
      const enrollment = await repo.findEnrollment(
        tx,
        studentId,
        enrollmentId,
        true,
      );
      if (!enrollment) throw new ClassEnrollmentNotFoundError();
      const installment = await repo.findInstallment(tx, enrollmentId, 2, true);
      const nowAt = currentTime();
      if (!installment) {
        throw new ClassEnrollmentInvalidOperationError(
          "This enrollment has no second installment",
        );
      }
      const walletBefore = await repo.getWalletByUser(tx, studentId);

      if (installment.state === "funded") {
        return thisPaymentSummary(
          tx,
          enrollment,
          "funded",
          0,
          walletBefore?.availableBalance ?? 0,
        );
      }
      if (installment.state === "defaulted") {
        return thisPaymentSummary(
          tx,
          enrollment,
          "defaulted",
          0,
          walletBefore?.availableBalance ?? 0,
        );
      }
      if (enrollment.state !== "active" || installment.state !== "pending") {
        return thisPaymentSummary(
          tx,
          enrollment,
          "expired",
          0,
          walletBefore?.availableBalance ?? 0,
        );
      }

      const dueSession = installment.dueSessionId
        ? (lockedSessions.find(
            (session) => session.id === installment.dueSessionId,
          ) ?? (await repo.getSessionDueInfo(tx, installment.dueSessionId)))
        : null;
      if (!dueSession || dueSession.state !== "scheduled") {
        throw new ClassEnrollmentConflictError(
          "The installment session is no longer scheduled; follow the class schedule update before paying",
        );
      }
      const dueAt = dueSession.startAt;
      if (installment.dueAt?.getTime() !== dueAt.getTime()) {
        await repo.updateInstallmentDueAt(tx, installment.id, dueAt, nowAt);
      }
      if (dueAt <= nowAt) {
        const defaulted = await repo.markInstallmentDefaulted(
          tx,
          installment.id,
          nowAt,
        );
        if (!defaulted) {
          throw new ClassEnrollmentConflictError(
            "The second installment changed before its unpaid seats were released",
          );
        }
        return thisPaymentSummary(
          tx,
          enrollment,
          "defaulted",
          0,
          walletBefore?.availableBalance ?? 0,
        );
      }

      const secondAllocations = (
        await repo.findAllocations(tx, enrollmentId, true)
      ).filter(
        (allocation) =>
          allocation.installmentId === installment.id &&
          allocation.state !== "released",
      );
      if (
        !matchesInstallmentAmount(installment, secondAllocations) ||
        secondAllocations.some(
          (allocation) => allocation.state !== "unfunded_reserved",
        )
      ) {
        throw new ClassEnrollmentConflictError(
          "This installment no longer owns all of its unfunded session reservations",
        );
      }
      const wallet = await repo.getWalletByUser(tx, studentId, true);
      const availableMarks = wallet?.availableBalance ?? 0;
      const shortfallMarks = Math.max(
        0,
        installment.amountMarks - availableMarks,
      );
      if (!wallet || shortfallMarks > 0) {
        return thisPaymentSummary(
          tx,
          enrollment,
          "insufficient",
          shortfallMarks || installment.amountMarks,
          availableMarks,
        );
      }
      for (const allocation of secondAllocations) {
        await deps.wallet.hold(tx, {
          walletId: wallet.id,
          amount: allocation.rateMarks,
          eventKey: allocation.fundingEventKey,
          sourceReference: allocation.fundingSourceReference,
          actorType: "student",
          reason: `Class enrollment ${enrollmentId}, session ${allocation.sessionId}`,
        });
      }
      const markedFunded = await repo.markInstallmentFunded(
        tx,
        installment.id,
        secondAllocations.length,
        nowAt,
      );
      if (!markedFunded) {
        throw new ClassEnrollmentConflictError(
          "The second installment changed while it was being funded",
        );
      }
      return thisPaymentSummary(
        tx,
        enrollment,
        "funded",
        0,
        availableMarks - installment.amountMarks,
      );
    });
  }

  async function createTopUpQuote(studentId: string, input: TopUpQuoteInput) {
    const nowAt = currentTime();
    const attempt = await deps.db.transaction(async (tx) => {
      const enrollment = await repo.findEnrollment(
        tx,
        studentId,
        input.enrollmentId,
        true,
      );
      if (!enrollment) throw new ClassEnrollmentNotFoundError();
      const installment = await repo.findInstallment(
        tx,
        input.enrollmentId,
        input.ordinal,
        true,
      );
      if (!installment) {
        throw new ClassEnrollmentInvalidOperationError(
          "This enrollment has no requested installment",
        );
      }
      const existing = await repo.findTopUpAttemptByRequestKey(
        tx,
        installment.id,
        input.requestKey,
        true,
      );
      if (existing) return existing;

      if (input.ordinal === 1) {
        if (
          enrollment.state !== "checkout_pending" ||
          installment.state !== "checkout_pending" ||
          !enrollment.checkoutExpiresAt ||
          enrollment.checkoutExpiresAt <= nowAt
        ) {
          throw new ClassEnrollmentConflictError(
            "This class checkout has expired or is no longer payable",
          );
        }
      } else {
        if (enrollment.state !== "active" || installment.state !== "pending") {
          throw new ClassEnrollmentConflictError(
            "This installment is no longer payable",
          );
        }
        if (!installment.dueSessionId) {
          throw new ClassEnrollmentConflictError(
            "This installment has no scheduled due session",
          );
        }
        const dueSession = await repo.getSessionDueInfo(
          tx,
          installment.dueSessionId,
        );
        if (!dueSession || dueSession.state !== "scheduled") {
          throw new ClassEnrollmentConflictError(
            "The installment session is no longer scheduled",
          );
        }
        if (dueSession.startAt <= nowAt) {
          throw new ClassEnrollmentConflictError(
            "The installment deadline has passed; unpaid future reservations were released",
          );
        }
      }

      const wallet = await repo.getWalletByUser(tx, studentId, true);
      const shortfallMarks = Math.max(
        0,
        installment.amountMarks - (wallet?.availableBalance ?? 0),
      );
      if (shortfallMarks === 0) {
        throw new ClassEnrollmentConflictError(
          "Your wallet now has enough Marks for this installment",
        );
      }
      return repo.insertTopUpAttempt(tx, {
        id: randomUUID(),
        installmentId: installment.id,
        requestKey: input.requestKey,
        requestedMarks: shortfallMarks,
        choice: null,
        quoteId: null,
        paymentId: null,
        createdAt: nowAt,
        updatedAt: nowAt,
      });
    });

    const quote = await deps.payment.createTopUpQuote(studentId, {
      requestKey: attempt.id,
      marks: attempt.requestedMarks,
    });
    await deps.db.transaction(async (tx) => {
      const current = await repo.findTopUpAttemptByRequestKey(
        tx,
        attempt.installmentId,
        attempt.requestKey,
        true,
      );
      if (!current) throw new ClassEnrollmentNotFoundError();
      if (current.quoteId && current.quoteId !== quote.quoteId) {
        throw new ClassEnrollmentConflictError(
          "This top-up request key already belongs to another quote",
        );
      }
      if (!current.quoteId) {
        await repo.updateTopUpAttempt(tx, current.id, {
          quoteId: quote.quoteId,
          updatedAt: currentTime(),
        });
      }
    });

    return {
      attemptId: attempt.id,
      requestKey: attempt.requestKey,
      quoteId: quote.quoteId,
      requestedMarks: quote.marks,
      revision: quote.revision,
      customAmountIdr: quote.customAmountIdr,
      exactPackage: quote.exactPackage,
      recommendedPackage: quote.recommendedPackage,
      expiresAt: quote.expiresAt,
      choice: attempt.choice as TopUpChoice | null,
    };
  }

  async function purchaseTopUp(studentId: string, input: TopUpPurchaseInput) {
    const attempt = await deps.db.transaction(async (tx) => {
      const owned = await repo.findTopUpAttemptForStudent(
        tx,
        studentId,
        input.attemptId,
        true,
      );
      if (!owned) throw new ClassEnrollmentNotFoundError();
      const currentChoice = safeRequestedChoice(owned.attempt.choice ?? "");
      if (currentChoice && currentChoice !== input.choice) {
        throw new ClassEnrollmentConflictError(
          "A top-up attempt cannot change its selected quote option",
        );
      }
      if (!owned.attempt.quoteId) {
        throw new ClassEnrollmentConflictError(
          "The top-up quote is not ready; retry the quote request",
        );
      }
      if (!currentChoice) {
        await repo.updateTopUpAttempt(tx, owned.attempt.id, {
          choice: input.choice,
          updatedAt: currentTime(),
        });
      }
      return { ...owned.attempt, choice: input.choice };
    });

    const wallet = await deps.wallet.getOrCreate(studentId);
    const purchase = await deps.payment.createPurchaseFromTopUpQuote(
      studentId,
      wallet.id,
      attempt.quoteId!,
      input.choice,
    );
    const paymentId = purchase.paymentId;
    const checkoutUrl = purchase.checkoutUrl;
    if (
      typeof paymentId !== "string" ||
      (checkoutUrl !== null && typeof checkoutUrl !== "string")
    ) {
      throw new ClassEnrollmentConflictError(
        "The top-up checkout returned an invalid payment identity",
      );
    }
    await deps.db.transaction(async (tx) => {
      const current = await repo.findTopUpAttemptForStudent(
        tx,
        studentId,
        attempt.id,
        true,
      );
      if (!current) throw new ClassEnrollmentNotFoundError();
      if (
        current.attempt.paymentId &&
        current.attempt.paymentId !== paymentId
      ) {
        throw new ClassEnrollmentConflictError(
          "This top-up attempt already belongs to another payment",
        );
      }
      if (!current.attempt.paymentId) {
        await repo.updateTopUpAttempt(tx, attempt.id, {
          paymentId,
          updatedAt: currentTime(),
        });
      }
    });

    return {
      attemptId: attempt.id,
      paymentId,
      checkoutUrl,
      status: purchase.status,
      recoveryRequired: purchase.recoveryRequired,
    };
  }

  async function processExpiredCheckout(enrollmentId: string, nowAt: Date) {
    const allocations = await repo.findAllocations(deps.db, enrollmentId);
    return deps.db.transaction(async (tx) => {
      await repo.lockSessions(
        tx,
        allocations.map((allocation) => allocation.sessionId),
      );
      const enrollment = await repo.findEnrollmentById(tx, enrollmentId, true);
      if (
        !enrollment ||
        enrollment.state !== "checkout_pending" ||
        !enrollment.checkoutExpiresAt ||
        enrollment.checkoutExpiresAt > nowAt
      ) {
        return false;
      }
      await repo.releaseCheckout(tx, enrollmentId, nowAt);
      return true;
    });
  }

  async function processDueInstallment(
    enrollmentId: string,
    installmentId: string,
    nowAt: Date,
  ) {
    const allocations = await repo.findAllocations(deps.db, enrollmentId);
    return deps.db.transaction(async (tx) => {
      const lockedSessions = await repo.lockSessions(
        tx,
        allocations.map((allocation) => allocation.sessionId),
      );
      const enrollment = await repo.findEnrollmentById(tx, enrollmentId, true);
      if (!enrollment || enrollment.state !== "active") return false;
      const installment = await repo.findInstallment(tx, enrollmentId, 2, true);
      if (
        !installment ||
        installment.id !== installmentId ||
        installment.state !== "pending" ||
        !installment.dueSessionId
      ) {
        return false;
      }
      const dueSession =
        lockedSessions.find(
          (session) => session.id === installment.dueSessionId,
        ) ?? (await repo.getSessionDueInfo(tx, installment.dueSessionId));
      if (!dueSession || dueSession.state !== "scheduled") return false;
      if (installment.dueAt?.getTime() !== dueSession.startAt.getTime()) {
        await repo.updateInstallmentDueAt(
          tx,
          installment.id,
          dueSession.startAt,
          nowAt,
        );
      }
      if (dueSession.startAt > nowAt) return false;
      return repo.markInstallmentDefaulted(tx, installment.id, nowAt);
    });
  }

  async function processInstallmentReminders(
    enrollmentId: string,
    installmentId: string,
    nowAt: Date,
  ) {
    const allocations = await repo.findAllocations(deps.db, enrollmentId);
    return deps.db.transaction(async (tx) => {
      const lockedSessions = await repo.lockSessions(
        tx,
        allocations.map((allocation) => allocation.sessionId),
      );
      const enrollment = await repo.findEnrollmentById(tx, enrollmentId, true);
      if (!enrollment || enrollment.state !== "active") return 0;
      const installment = await repo.findInstallment(tx, enrollmentId, 2, true);
      if (
        !installment ||
        installment.id !== installmentId ||
        installment.state !== "pending" ||
        !installment.dueSessionId
      ) {
        return 0;
      }
      const dueSession =
        lockedSessions.find(
          (session) => session.id === installment.dueSessionId,
        ) ?? (await repo.getSessionDueInfo(tx, installment.dueSessionId));
      if (!dueSession || dueSession.state !== "scheduled") return 0;
      const dueAt = dueSession.startAt;
      if (installment.dueAt?.getTime() !== dueAt.getTime()) {
        await repo.updateInstallmentDueAt(tx, installment.id, dueAt, nowAt);
      }

      let queued = 0;
      for (const daysBefore of [7, 1] as const) {
        const key = `${daysBefore}d` as const;
        const processedAt =
          key === "7d"
            ? installment.reminder7dProcessedAt
            : installment.reminder1dProcessedAt;
        const processedForAt =
          key === "7d"
            ? installment.reminder7dForAt
            : installment.reminder1dForAt;
        if (processedAt && processedForAt?.getTime() === dueAt.getTime())
          continue;

        const boundary = reminderDate(dueAt, daysBefore);
        if (boundary > nowAt) continue;
        if (enrollment.createdAt <= boundary) {
          await deps.notification.write({
            db: tx,
            userId: enrollment.studentId,
            category: "payment",
            title: `Class installment due in ${daysBefore} day${daysBefore === 1 ? "" : "s"}`,
            body: `Your second installment of ${installment.amountMarks} Marks is due before ${formatDueAt(dueAt)}. Open your class enrollment to pay it. ${normalizeBaseUrl(deps.appBaseUrl)}/classes/${enrollment.classId}`,
            severity: "action",
            emailRequired: true,
            eventKey: `class-enrollment:${enrollment.id}:installment:2:reminder:${key}:${dueAt.toISOString()}`,
            metadata: {
              classId: enrollment.classId,
              enrollmentId: enrollment.id,
              installmentId: installment.id,
              dueAt: dueAt.toISOString(),
              reminderDaysBefore: daysBefore,
            },
          });
          queued += 1;
        }
        await repo.markReminderProcessed(tx, installment.id, key, dueAt, nowAt);
      }
      return queued;
    });
  }

  async function processDueJobs() {
    const nowAt = currentTime();
    const [expiredCandidates, dueCandidates, reminderCandidates] =
      await Promise.all([
        repo.findExpiredCheckouts(deps.db, nowAt),
        repo.findDueInstallments(deps.db, nowAt),
        repo.findReminderCandidates(deps.db, nowAt),
      ]);
    let expiredCheckouts = 0;
    let defaultedInstallments = 0;
    let remindersQueued = 0;
    for (const candidate of expiredCandidates) {
      if (await processExpiredCheckout(candidate.id, nowAt))
        expiredCheckouts += 1;
    }
    for (const candidate of dueCandidates) {
      if (
        await processDueInstallment(
          candidate.enrollmentId,
          candidate.installmentId,
          nowAt,
        )
      ) {
        defaultedInstallments += 1;
      }
    }
    for (const candidate of reminderCandidates) {
      remindersQueued += await processInstallmentReminders(
        candidate.enrollmentId,
        candidate.installmentId,
        nowAt,
      );
    }
    log({
      level: "info",
      action: "class_enrollment_due_jobs_complete",
      expiredCheckouts,
      defaultedInstallments,
      remindersQueued,
    });
    return { expiredCheckouts, defaultedInstallments, remindersQueued };
  }

  async function thisPaymentSummary(
    conn: DbOrTx,
    enrollment: typeof academyClassEnrollment.$inferSelect,
    outcome:
      | "funded"
      | "checkout_pending"
      | "defaulted"
      | "expired"
      | "insufficient",
    shortfallMarks: number,
    availableMarks?: number,
  ) {
    const [installments, allocations] = await Promise.all([
      repo.findInstallments(conn, enrollment.id),
      repo.findAllocations(conn, enrollment.id),
    ]);
    return {
      enrollment: {
        id: enrollment.id,
        plan: enrollment.plan as "full" | "half" | "single" | "masterclass",
        state: enrollment.state as
          | "checkout_pending"
          | "active"
          | "expired"
          | "cancelled",
        sessionCount: enrollment.sessionCount,
        firstRateMarks: enrollment.firstRateMarks,
        secondRateMarks: enrollment.secondRateMarks,
        firstInstallmentMarks: enrollment.firstInstallmentMarks,
        secondInstallmentMarks: enrollment.secondInstallmentMarks,
        totalMarks: enrollment.totalMarks,
        checkoutExpiresAt: enrollment.checkoutExpiresAt,
        createdAt: enrollment.createdAt,
        installments: installments.map((installment) => ({
          id: installment.id,
          ordinal: installment.ordinal as 1 | 2,
          rateMarks: installment.rateMarks,
          sessionCount: installment.sessionCount,
          amountMarks: installment.amountMarks,
          state: installment.state as
            | "checkout_pending"
            | "pending"
            | "funded"
            | "defaulted"
            | "expired"
            | "cancelled",
          dueAt: installment.dueAt,
          checkoutExpiresAt: installment.checkoutExpiresAt,
          fundedAt: installment.fundedAt,
        })),
        allocations: allocations.map((allocation) => ({
          sessionId: allocation.sessionId,
          ordinal: allocation.ordinal,
          sequenceNumber: allocation.sequenceNumber,
          rateMarks: allocation.rateMarks,
          state: allocation.state as
            | "checkout_reserved"
            | "unfunded_reserved"
            | "funded"
            | "released",
          fundedMarks: allocation.fundedMarks,
          spentMarks: allocation.spentMarks,
          releasedMarks: allocation.releasedMarks,
        })),
      },
      outcome,
      availableMarks: availableMarks ?? 0,
      shortfallMarks,
    };
  }

  return {
    ...sessionReports,
    previewAdminCancellation: adminCancellation.preview,
    confirmAdminCancellation: adminCancellation.confirm,
    previewAdminSessionCancellation: adminSessionCancellation.preview,
    confirmAdminSessionCancellation: adminSessionCancellation.confirm,
    getAdminMinimumCheck: minimumLifecycle.getMinimumCheck,
    previewAdminMinimumDecision: minimumLifecycle.preview,
    confirmAdminMinimumDecision: minimumLifecycle.confirm,
    getMyClassEnrollments,
    quoteCancellation: (
      studentId: string,
      input: z.infer<typeof classEnrollmentCancellationInput>,
    ) => cancelEnrollment(studentId, input),
    confirmCancellation: (
      studentId: string,
      input: z.infer<typeof confirmClassEnrollmentCancellationInput>,
    ) => cancelEnrollment(studentId, input, input),
    createEnrollment,
    completeCheckout,
    paySecondInstallment,
    createTopUpQuote,
    purchaseTopUp,
    processDueJobs,
  };
}

export type ClassEnrollmentService = ReturnType<
  typeof createClassEnrollmentService
>;
