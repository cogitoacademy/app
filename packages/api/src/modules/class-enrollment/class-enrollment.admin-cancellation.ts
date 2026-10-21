import { createHash } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  academyClass,
  academyClassMeeting,
  academyClassSession,
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  auditLog,
  wallet,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { WalletService } from "../wallet/wallet.service";
import type { NotificationService } from "../notification/notification.service";
import { remainingAllocationMarks } from "./class-enrollment.funding";
import {
  ClassEnrollmentConflictError,
  ClassEnrollmentNotFoundError,
  ClassEnrollmentInvalidOperationError,
} from "./class-enrollment.errors";
import {
  adminClassCancellationOutput,
  type adminClassCancellationInput,
  type confirmAdminClassCancellationInput,
} from "./class-enrollment.types";
import type { z } from "zod";

export function createAdminClassCancellation(deps: {
  db: DbType;
  wallet: Pick<WalletService, "release">;
  notification: Pick<NotificationService, "write">;
  clock?: () => Date;
}) {
  async function cancel(
    actorId: string,
    input: z.infer<typeof adminClassCancellationInput>,
    confirmation?: z.infer<typeof confirmAdminClassCancellationInput>,
  ) {
    return deps.db.transaction(async (tx) => {
      // Enrollment creation also locks class before sessions. Checkout,
      // cancellation and completion lock the same session IDs in sorted order.
      const [record] = await tx
        .select()
        .from(academyClass)
        .where(eq(academyClass.id, input.classId))
        .for("update");
      if (!record) throw new ClassEnrollmentNotFoundError();
      if (confirmation) {
        const [receipt] = await tx
          .select({ details: auditLog.details })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.targetId, input.classId),
              eq(auditLog.action, "academy_class.cancelled"),
              sql`${auditLog.details}->>'requestKey' = ${confirmation.requestKey}`,
            ),
          )
          .limit(1);
        if (receipt) {
          const saved = adminClassCancellationOutput.parse(
            receipt.details?.quote,
          );
          if (
            saved.quoteVersion !== confirmation.quoteVersion ||
            receipt.details?.reason !== input.reason
          )
            throw new ClassEnrollmentConflictError(
              "This cancellation request key was already used",
            );
          return saved;
        }
      }
      if (!["published", "postponed"].includes(record.state))
        throw new ClassEnrollmentInvalidOperationError(
          "Only a published or postponed class can be cancelled",
        );
      if (record.version !== input.expectedVersion)
        throw new ClassEnrollmentConflictError(
          "The class changed; reload before cancelling",
        );
      const sessions = await tx
        .select()
        .from(academyClassSession)
        .where(eq(academyClassSession.classId, input.classId))
        .orderBy(asc(academyClassSession.id))
        .for("update");
      const enrollments = await tx
        .select()
        .from(academyClassEnrollment)
        .where(eq(academyClassEnrollment.classId, input.classId))
        .orderBy(asc(academyClassEnrollment.id))
        .for("update");
      const enrollmentIds = enrollments.map((row) => row.id);
      if (enrollmentIds.length)
        await tx
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
          .for("update");
      const allocations = await tx
        .select()
        .from(academyClassEnrollmentAllocation)
        .where(eq(academyClassEnrollmentAllocation.classId, input.classId))
        .orderBy(
          asc(academyClassEnrollmentAllocation.sessionId),
          asc(academyClassEnrollmentAllocation.id),
        )
        .for("update");
      const now = deps.clock?.() ?? new Date();
      const cancelledSessionIds = sessions
        .filter((row) => row.state === "scheduled" && row.startAt > now)
        .map((row) => row.id);
      const released = allocations.filter(
        (row) =>
          row.state !== "released" &&
          (row.state !== "funded" ||
            cancelledSessionIds.includes(row.sessionId)),
      );
      const retained = allocations.filter(
        (row) =>
          row.state === "funded" &&
          !cancelledSessionIds.includes(row.sessionId),
      );
      const summary = {
        classId: record.id,
        expectedVersion: record.version,
        feeMarks: 0 as const,
        returnMarks: released.reduce(
          (sum, row) => sum + remainingAllocationMarks(row),
          0,
        ),
        retainedMarks: retained.reduce(
          (sum, row) => sum + remainingAllocationMarks(row),
          0,
        ),
        cancelledSessionIds,
        releasedAllocationIds: released.map((row) => row.id),
      };
      const quote = {
        ...summary,
        quoteVersion: createHash("sha256")
          .update(
            JSON.stringify({
              summary,
              reason: input.reason,
              allocations: allocations.map((row) => ({
                id: row.id,
                state: row.state,
                funded: row.fundedMarks,
                spent: row.spentMarks,
                released: row.releasedMarks,
              })),
            }),
          )
          .digest("hex"),
      };
      if (!confirmation) return quote;
      if (confirmation.quoteVersion !== quote.quoteVersion)
        throw new ClassEnrollmentConflictError(
          "Class cancellation amounts changed; review a fresh quote",
        );
      const studentIds = [
        ...new Set(released.map((row) => row.studentId)),
      ].toSorted();
      const wallets = studentIds.length
        ? await tx
            .select()
            .from(wallet)
            .where(inArray(wallet.userId, studentIds))
            .orderBy(asc(wallet.id))
            .for("update")
        : [];
      for (const row of released) {
        const amount = remainingAllocationMarks(row);
        if (amount > 0) {
          const studentWallet = wallets.find(
            (item) => item.userId === row.studentId,
          );
          if (!studentWallet)
            throw new ClassEnrollmentConflictError(
              "A funded student wallet is unavailable",
            );
          await deps.wallet.release(tx, {
            walletId: studentWallet.id,
            amount,
            eventKey: `class-allocation:${row.id}:admin-cancel:return`,
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
      if (enrollmentIds.length) {
        await tx
          .update(academyClassEnrollmentInstallment)
          .set({ state: "cancelled", updatedAt: now })
          .where(
            and(
              inArray(
                academyClassEnrollmentInstallment.enrollmentId,
                enrollmentIds,
              ),
              inArray(academyClassEnrollmentInstallment.state, [
                "pending",
                "checkout_pending",
              ]),
            ),
          );
        await tx
          .update(academyClassEnrollment)
          .set({ state: "cancelled", updatedAt: now })
          .where(
            and(
              inArray(academyClassEnrollment.id, enrollmentIds),
              inArray(academyClassEnrollment.state, [
                "active",
                "checkout_pending",
              ]),
            ),
          );
      }
      if (cancelledSessionIds.length)
        await tx
          .update(academyClassSession)
          .set({ state: "cancelled", updatedAt: now })
          .where(inArray(academyClassSession.id, cancelledSessionIds));
      if (cancelledSessionIds.length)
        await tx
          .update(academyClassMeeting)
          .set({ nextRetryAt: now, updatedAt: now })
          .where(
            and(
              inArray(academyClassMeeting.sessionId, cancelledSessionIds),
              ne(academyClassMeeting.status, "processing"),
              ne(academyClassMeeting.status, "cancelled"),
            ),
          );
      await tx
        .update(academyClass)
        .set({
          state: "cancelled",
          version: record.version + 1,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(academyClass.id, record.id));
      await tx.insert(auditLog).values({
        actorId,
        actorType: "admin",
        action: "academy_class.cancelled",
        targetId: record.id,
        targetType: "academy_class",
        beforeState: { state: record.state, version: record.version },
        afterState: { state: "cancelled", version: record.version + 1 },
        details: {
          requestKey: confirmation.requestKey,
          reason: input.reason,
          quote,
        },
      });
      for (const studentId of [
        ...new Set(enrollments.map((row) => row.studentId)),
      ].toSorted()) {
        const returned = released
          .filter((row) => row.studentId === studentId)
          .reduce((sum, row) => sum + remainingAllocationMarks(row), 0);
        await deps.notification.write({
          db: tx,
          userId: studentId,
          category: "refund",
          severity: "action",
          emailRequired: true,
          title: "Class cancelled by Cogito",
          body: `${record.titleEn}: ${returned} Marks returned to your available balance with no cancellation fee. Past delivery holds and earned fees are preserved. Reason: ${input.reason}`,
          eventKey: `class:${record.id}:admin-cancel:student:${studentId}`,
        });
      }
      for (const tutorId of [
        ...new Set(
          sessions
            .filter((row) => cancelledSessionIds.includes(row.id))
            .map((row) => row.tutorId),
        ),
      ].toSorted()) {
        await deps.notification.write({
          db: tx,
          userId: tutorId,
          category: "schedule",
          severity: "action",
          emailRequired: true,
          title: "Upcoming class sessions cancelled",
          body: `${record.titleEn}: future sessions were cancelled. Already earned fees are unchanged. Reason: ${input.reason}`,
          eventKey: `class:${record.id}:admin-cancel:tutor:${tutorId}`,
        });
      }
      // Meeting cancellation is durable: the existing worker sees cancelled
      // session rows, including a create that finishes after this commit.
      return quote;
    });
  }
  return {
    preview: (
      actorId: string,
      input: z.infer<typeof adminClassCancellationInput>,
    ) => cancel(actorId, input),
    confirm: (
      actorId: string,
      input: z.infer<typeof confirmAdminClassCancellationInput>,
    ) => cancel(actorId, input, input),
  };
}
