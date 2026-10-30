import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  academyClass,
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassMeeting,
  academyClassSession,
  academyClassSessionReport,
  auditLog,
  wallet,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { NotificationService } from "../notification/notification.service";
import type { WalletService } from "../wallet/wallet.service";
import {
  ClassEnrollmentConflictError,
  ClassEnrollmentInvalidOperationError,
  ClassEnrollmentNotFoundError,
} from "./class-enrollment.errors";
import { remainingAllocationMarks } from "./class-enrollment.funding";
import {
  adminClassSessionCancellationOutput,
  type adminClassSessionCancellationInput,
  type confirmAdminClassSessionCancellationInput,
} from "./class-enrollment.types";
import type { z } from "zod";

const ACTIVE_ALLOCATION_STATES = [
  "checkout_reserved",
  "unfunded_reserved",
  "funded",
] as const;

function isActiveAllocationState(state: string) {
  return ACTIVE_ALLOCATION_STATES.some((activeState) => activeState === state);
}

export function createAdminClassSessionCancellation(deps: {
  db: DbType;
  wallet: Pick<WalletService, "release">;
  notification: Pick<NotificationService, "write">;
  clock?: () => Date;
}) {
  async function cancel(
    actorId: string,
    input: z.infer<typeof adminClassSessionCancellationInput>,
    confirmation?: z.infer<typeof confirmAdminClassSessionCancellationInput>,
  ) {
    return deps.db.transaction(async (tx) => {
      const [classRecord] = await tx
        .select()
        .from(academyClass)
        .where(eq(academyClass.id, input.classId))
        .for("update");
      if (!classRecord) throw new ClassEnrollmentNotFoundError();

      if (confirmation) {
        const [receipt] = await tx
          .select({ details: auditLog.details })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.targetId, input.sessionId),
              eq(auditLog.action, "academy_class.session_cancelled"),
              eq(auditLog.targetType, "academy_class_session"),
              sql`${auditLog.details}->>'requestKey' = ${confirmation.requestKey}`,
            ),
          )
          .limit(1);
        if (receipt) {
          const saved = adminClassSessionCancellationOutput.parse(
            receipt.details?.quote,
          );
          if (
            saved.classId !== input.classId ||
            saved.sessionId !== input.sessionId ||
            saved.expectedClassVersion !== input.expectedClassVersion ||
            saved.expectedSessionVersion !== input.expectedSessionVersion ||
            saved.quoteVersion !== confirmation.quoteVersion ||
            receipt.details?.reason !== input.reason
          )
            throw new ClassEnrollmentConflictError(
              "This session cancellation request key was already used",
            );
          return saved;
        }
      }

      if (!["published", "postponed"].includes(classRecord.state))
        throw new ClassEnrollmentInvalidOperationError(
          "Only a published or postponed class session can be cancelled",
        );
      if (classRecord.version !== input.expectedClassVersion)
        throw new ClassEnrollmentConflictError(
          "The class changed; reload before cancelling this session",
        );

      const [session] = await tx
        .select()
        .from(academyClassSession)
        .where(
          and(
            eq(academyClassSession.id, input.sessionId),
            eq(academyClassSession.classId, input.classId),
          ),
        )
        .for("update");
      if (!session) throw new ClassEnrollmentNotFoundError();
      if (session.version !== input.expectedSessionVersion)
        throw new ClassEnrollmentConflictError(
          "The session changed; reload before cancelling it",
        );

      const now = deps.clock?.() ?? new Date();
      if (session.state !== "scheduled" || session.startAt <= now)
        throw new ClassEnrollmentInvalidOperationError(
          "Only an upcoming scheduled session can be cancelled. Ongoing and delivered sessions keep their delivery holds and earned fees",
        );
      const [report] = await tx
        .select({ id: academyClassSessionReport.id })
        .from(academyClassSessionReport)
        .where(eq(academyClassSessionReport.sessionId, session.id))
        .limit(1);
      if (report)
        throw new ClassEnrollmentConflictError(
          "A session with a delivery report cannot be cancelled",
        );

      const candidateAllocations = await tx
        .select({ enrollmentId: academyClassEnrollmentAllocation.enrollmentId })
        .from(academyClassEnrollmentAllocation)
        .where(eq(academyClassEnrollmentAllocation.sessionId, session.id));
      const enrollmentIds = [
        ...new Set(candidateAllocations.map((row) => row.enrollmentId)),
      ].toSorted();
      const enrollments = enrollmentIds.length
        ? await tx
            .select()
            .from(academyClassEnrollment)
            .where(inArray(academyClassEnrollment.id, enrollmentIds))
            .orderBy(asc(academyClassEnrollment.id))
            .for("update")
        : [];
      const installments = enrollmentIds.length
        ? await tx
            .select()
            .from(academyClassEnrollmentInstallment)
            .where(
              inArray(
                academyClassEnrollmentInstallment.enrollmentId,
                enrollmentIds,
              ),
            )
            .orderBy(
              asc(academyClassEnrollmentInstallment.enrollmentId),
              asc(academyClassEnrollmentInstallment.ordinal),
            )
            .for("update")
        : [];
      const allocations = enrollmentIds.length
        ? await tx
            .select()
            .from(academyClassEnrollmentAllocation)
            .where(
              inArray(
                academyClassEnrollmentAllocation.enrollmentId,
                enrollmentIds,
              ),
            )
            .orderBy(
              asc(academyClassEnrollmentAllocation.sessionId),
              asc(academyClassEnrollmentAllocation.id),
            )
            .for("update")
        : [];
      const targetAllocations = allocations.filter(
        (row) => row.sessionId === session.id,
      );
      const releasable = targetAllocations.filter((row) =>
        isActiveAllocationState(row.state),
      );
      const returnMarks = releasable.reduce(
        (total, row) =>
          total + (row.state === "funded" ? remainingAllocationMarks(row) : 0),
        0,
      );
      const releasedAllocationIds = releasable.map((row) => row.id).toSorted();
      const quoteBase = {
        classId: classRecord.id,
        sessionId: session.id,
        expectedClassVersion: classRecord.version,
        expectedSessionVersion: session.version,
        feeMarks: 0 as const,
        returnMarks,
        releasedAllocationIds,
      };
      const quote = adminClassSessionCancellationOutput.parse({
        ...quoteBase,
        quoteVersion: createHash("sha256")
          .update(
            JSON.stringify({
              quoteBase,
              reason: input.reason,
              classState: classRecord.state,
              session: {
                state: session.state,
                startAt: session.startAt,
                version: session.version,
              },
              allocations: allocations.map((row) => ({
                id: row.id,
                sessionId: row.sessionId,
                installmentId: row.installmentId,
                state: row.state,
                funded: row.fundedMarks,
                spent: row.spentMarks,
                released: row.releasedMarks,
              })),
              installments: installments.map((row) => ({
                id: row.id,
                state: row.state,
                sessionCount: row.sessionCount,
                amountMarks: row.amountMarks,
                dueSessionId: row.dueSessionId,
                dueAt: row.dueAt,
              })),
              enrollmentStates: enrollments.map((row) => ({
                id: row.id,
                state: row.state,
              })),
              reportExists: Boolean(report),
            }),
          )
          .digest("hex"),
      });
      if (!confirmation) return quote;
      if (confirmation.quoteVersion !== quote.quoteVersion)
        throw new ClassEnrollmentConflictError(
          "Session cancellation amounts or enrollment payments changed; review a fresh quote",
        );

      const studentIds = [
        ...new Set(releasable.map((row) => row.studentId)),
      ].toSorted();
      const wallets = studentIds.length
        ? await tx
            .select()
            .from(wallet)
            .where(inArray(wallet.userId, studentIds))
            .orderBy(asc(wallet.id))
            .for("update")
        : [];
      for (const row of releasable) {
        const amount =
          row.state === "funded" ? remainingAllocationMarks(row) : 0;
        if (amount > 0) {
          const studentWallet = wallets.find(
            (item) => item.userId === row.studentId,
          );
          if (!studentWallet)
            throw new ClassEnrollmentConflictError(
              "A funded student's wallet is unavailable",
            );
          await deps.wallet.release(tx, {
            walletId: studentWallet.id,
            amount,
            eventKey: `class-allocation:${row.id}:admin-session-cancel:return`,
            sourceReference: row.fundingSourceReference,
            actorType: "admin",
            reason: input.reason,
          });
        }
        await tx
          .update(academyClassEnrollmentAllocation)
          .set({
            state: "released",
            releasedMarks: row.releasedMarks + amount,
            updatedAt: now,
          })
          .where(eq(academyClassEnrollmentAllocation.id, row.id));
      }

      const allocationsByInstallment = new Map<string, typeof allocations>();
      for (const allocation of allocations) {
        const group =
          allocationsByInstallment.get(allocation.installmentId) ?? [];
        group.push(allocation);
        allocationsByInstallment.set(allocation.installmentId, group);
      }
      const affectedInstallmentIds = new Set(
        releasable.map((row) => row.installmentId),
      );
      for (const installment of installments) {
        if (
          !affectedInstallmentIds.has(installment.id) ||
          !["pending", "checkout_pending"].includes(installment.state)
        )
          continue;
        const remaining = (allocationsByInstallment.get(installment.id) ?? [])
          .filter(
            (row) =>
              row.sessionId !== session.id &&
              isActiveAllocationState(row.state),
          )
          .toSorted((left, right) => left.ordinal - right.ordinal);
        if (remaining.length === 0) {
          await tx
            .update(academyClassEnrollmentInstallment)
            .set({
              state: "cancelled",
              checkoutExpiresAt: null,
              updatedAt: now,
            })
            .where(eq(academyClassEnrollmentInstallment.id, installment.id));
          continue;
        }
        const nextDueSessionId = remaining[0]!.sessionId;
        const [nextDueSession] = await tx
          .select({ startAt: academyClassSession.startAt })
          .from(academyClassSession)
          .where(eq(academyClassSession.id, nextDueSessionId))
          .limit(1);
        await tx
          .update(academyClassEnrollmentInstallment)
          .set({
            sessionCount: remaining.length,
            amountMarks: remaining.length * installment.rateMarks,
            dueSessionId:
              installment.ordinal === 2
                ? nextDueSessionId
                : installment.dueSessionId,
            dueAt:
              installment.ordinal === 2
                ? (nextDueSession?.startAt ?? installment.dueAt)
                : installment.dueAt,
            updatedAt: now,
          })
          .where(eq(academyClassEnrollmentInstallment.id, installment.id));
      }

      const activeCheckoutIds = enrollments
        .filter((row) => row.state === "checkout_pending")
        .map((row) => row.id);
      for (const enrollmentId of activeCheckoutIds) {
        const firstInstallment = installments.find(
          (row) => row.enrollmentId === enrollmentId && row.ordinal === 1,
        );
        const checkoutAllocations = allocations.filter(
          (row) =>
            row.enrollmentId === enrollmentId &&
            row.installmentId === firstInstallment?.id &&
            row.state === "checkout_reserved" &&
            row.sessionId !== session.id,
        );
        if (checkoutAllocations.length > 0) continue;
        const otherAllocations = allocations.filter(
          (row) =>
            row.enrollmentId === enrollmentId &&
            row.sessionId !== session.id &&
            isActiveAllocationState(row.state),
        );
        for (const row of otherAllocations) {
          await tx
            .update(academyClassEnrollmentAllocation)
            .set({ state: "released", updatedAt: now })
            .where(eq(academyClassEnrollmentAllocation.id, row.id));
        }
        await tx
          .update(academyClassEnrollmentInstallment)
          .set({ state: "cancelled", checkoutExpiresAt: null, updatedAt: now })
          .where(
            and(
              eq(academyClassEnrollmentInstallment.enrollmentId, enrollmentId),
              inArray(academyClassEnrollmentInstallment.state, [
                "pending",
                "checkout_pending",
              ]),
            ),
          );
        await tx
          .update(academyClassEnrollment)
          .set({ state: "cancelled", checkoutExpiresAt: null, updatedAt: now })
          .where(eq(academyClassEnrollment.id, enrollmentId));
      }

      if (session.startAt <= (deps.clock?.() ?? new Date()))
        throw new ClassEnrollmentConflictError(
          "The session started while cancellation was being processed; no seats or Marks were changed",
        );

      const [cancelledSession] = await tx
        .update(academyClassSession)
        .set({
          state: "cancelled",
          version: session.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(academyClassSession.id, session.id),
            eq(academyClassSession.version, input.expectedSessionVersion),
            eq(academyClassSession.state, "scheduled"),
          ),
        )
        .returning({ id: academyClassSession.id });
      if (!cancelledSession)
        throw new ClassEnrollmentConflictError(
          "The session changed while cancellation was being confirmed",
        );
      const [updatedClass] = await tx
        .update(academyClass)
        .set({
          version: classRecord.version + 1,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(
          and(
            eq(academyClass.id, classRecord.id),
            eq(academyClass.version, input.expectedClassVersion),
          ),
        )
        .returning({ version: academyClass.version });
      if (!updatedClass)
        throw new ClassEnrollmentConflictError(
          "The class changed while cancellation was being confirmed",
        );
      await tx
        .update(academyClassMeeting)
        .set({ nextRetryAt: now, updatedAt: now })
        .where(
          and(
            eq(academyClassMeeting.sessionId, session.id),
            ne(academyClassMeeting.status, "processing"),
            ne(academyClassMeeting.status, "cancelled"),
          ),
        );
      await tx.insert(auditLog).values({
        actorId,
        actorType: "admin",
        action: "academy_class.session_cancelled",
        targetId: session.id,
        targetType: "academy_class_session",
        beforeState: {
          classVersion: classRecord.version,
          sessionState: session.state,
          sessionVersion: session.version,
          startAt: session.startAt,
          endAt: session.endAt,
        },
        afterState: {
          classVersion: updatedClass.version,
          sessionState: "cancelled",
          sessionVersion: session.version + 1,
          startAt: session.startAt,
          endAt: session.endAt,
        },
        details: {
          requestKey: confirmation.requestKey,
          reason: input.reason,
          quote,
        },
        createdAt: now,
      });
      for (const studentId of studentIds) {
        const returned = releasable
          .filter(
            (row) => row.studentId === studentId && row.state === "funded",
          )
          .reduce((total, row) => total + remainingAllocationMarks(row), 0);
        await deps.notification.write({
          db: tx,
          userId: studentId,
          category: "refund",
          severity: "action",
          emailRequired: true,
          title: "Class session cancelled by Cogito",
          body: `${classRecord.titleEn}, session ${session.sequenceNumber}: ${returned} Marks returned with no cancellation fee. Other class sessions and their original prices remain unchanged. Reason: ${input.reason}`,
          eventKey: `class:${classRecord.id}:session:${session.id}:admin-cancel:student:${studentId}`,
          metadata: { classId: classRecord.id, sessionId: session.id },
        });
      }
      await deps.notification.write({
        db: tx,
        userId: session.tutorId,
        category: "schedule",
        severity: "action",
        emailRequired: true,
        title: "Class session cancelled by Cogito",
        body: `${classRecord.titleEn}, session ${session.sequenceNumber} was cancelled. No tutor fee is created for an undelivered session. Reason: ${input.reason}`,
        eventKey: `class:${classRecord.id}:session:${session.id}:admin-cancel:tutor`,
        metadata: { classId: classRecord.id, sessionId: session.id },
      });
      return quote;
    });
  }

  return {
    preview: (
      actorId: string,
      input: z.infer<typeof adminClassSessionCancellationInput>,
    ) => cancel(actorId, input),
    confirm: (
      actorId: string,
      input: z.infer<typeof confirmAdminClassSessionCancellationInput>,
    ) => cancel(actorId, input, input),
  };
}
