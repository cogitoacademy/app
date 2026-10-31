import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  academyClass,
  academyClassEnrollmentAllocation,
  academyClassSession,
  academyClassSessionReport,
  academyClassSessionReportRevision,
  academyClassTutorAbsence,
  auditLog,
  tutorSessionFee,
  wallet as walletTable,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import { settlementTransaction } from "../../lib/settlement-transaction";
import type { WalletService } from "../wallet/wallet.service";
import type { ReferralService } from "../referral/referral.service";
import type { NotificationService } from "../notification/notification.service";
import { completionFeedbackInput } from "../booking/booking.types";
import { remainingAllocationMarks } from "./class-enrollment.funding";
import {
  ClassEnrollmentConflictError,
  ClassEnrollmentInvalidOperationError,
  ClassEnrollmentNotFoundError,
} from "./class-enrollment.errors";
import {
  listClassSessionReportsInput,
  submitClassSessionReportInput,
} from "./class-enrollment.types";
import type { z } from "zod";

type Allocation = typeof academyClassEnrollmentAllocation.$inferSelect;
type ChargeableAllocation = Pick<
  Allocation,
  | "id"
  | "studentId"
  | "fundingSourceReference"
  | "state"
  | "rateMarks"
  | "fundedMarks"
  | "spentMarks"
  | "releasedMarks"
>;
type ActorRole = string;
type ReportInput = z.infer<typeof submitClassSessionReportInput>;

export function classSessionSettlementAmounts(
  allocations: readonly ChargeableAllocation[],
) {
  return allocations.flatMap((allocation) => {
    if (allocation.state !== "funded") return [];
    const amount = remainingAllocationMarks(allocation);
    return amount > 0 ? [{ allocation, amount }] : [];
  });
}

function toReport(row: typeof academyClassSessionReport.$inferSelect) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    version: row.version,
    discussion: row.discussion,
    strengths: row.strengths,
    improvements: row.improvements,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createClassSessionReportService(deps: {
  db: DbType;
  wallet: Pick<WalletService, "deduct">;
  notification: Pick<NotificationService, "write">;
  referralPort?: Pick<ReferralService, "recordEligibleFirstCompletion">;
  clock?: () => Date;
}) {
  const currentTime = () => deps.clock?.() ?? new Date();

  async function submitSessionReport(
    actorId: string,
    actorRole: ActorRole,
    rawInput: ReportInput,
  ) {
    const feedback = completionFeedbackInput.safeParse(rawInput.feedback);
    if (!feedback.success)
      throw new ClassEnrollmentInvalidOperationError(
        feedback.error.issues[0]?.message ?? "Invalid session feedback",
      );
    if (actorRole !== "admin" && actorRole !== "tutor")
      throw new ClassEnrollmentNotFoundError();
    const adminReason =
      actorRole === "admin" ? rawInput.adminReason?.trim() : undefined;
    const adminReasonLength = adminReason ? Array.from(adminReason).length : 0;
    if (
      actorRole === "admin" &&
      (!adminReason || adminReasonLength < 3 || adminReasonLength > 500)
    )
      throw new ClassEnrollmentInvalidOperationError(
        "An admin reason is required to submit or correct a class report; it must contain 3 to 500 characters",
      );

    const normalizedFeedback = feedback.data;
    return settlementTransaction(deps.db, async (tx) => {
      const [classRecord] = await tx
        .select()
        .from(academyClass)
        .where(eq(academyClass.id, rawInput.classId))
        .for("update");
      if (!classRecord) throw new ClassEnrollmentNotFoundError();

      const [session] = await tx
        .select()
        .from(academyClassSession)
        .where(eq(academyClassSession.id, rawInput.sessionId))
        .for("update");
      if (!session || session.classId !== classRecord.id)
        throw new ClassEnrollmentNotFoundError();

      const [report] = await tx
        .select()
        .from(academyClassSessionReport)
        .where(eq(academyClassSessionReport.sessionId, session.id))
        .for("update");
      if (
        actorRole === "tutor" &&
        (report?.deliveryTutorId ?? session.tutorId) !== actorId
      )
        throw new ClassEnrollmentNotFoundError();
      const allocations = await tx
        .select()
        .from(academyClassEnrollmentAllocation)
        .where(eq(academyClassEnrollmentAllocation.sessionId, session.id))
        .orderBy(asc(academyClassEnrollmentAllocation.id))
        .for("update");
      const settlement = classSessionSettlementAmounts(allocations);
      const studentIds = [
        ...new Set(settlement.map(({ allocation }) => allocation.studentId)),
      ].toSorted();
      const wallets = studentIds.length
        ? await tx
            .select()
            .from(walletTable)
            .where(inArray(walletTable.userId, studentIds))
            .orderBy(asc(walletTable.id))
            .for("update")
        : [];

      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            actorId,
            actorRole,
            expectedVersion: rawInput.expectedVersion,
            deliveryConfirmed: rawInput.deliveryConfirmed,
            adminReason: adminReason ?? null,
            feedback: normalizedFeedback,
          }),
        )
        .digest("hex");
      if (report) {
        const [priorRequest] = await tx
          .select()
          .from(academyClassSessionReportRevision)
          .where(
            and(
              eq(academyClassSessionReportRevision.reportId, report.id),
              eq(
                academyClassSessionReportRevision.requestKey,
                rawInput.requestKey,
              ),
            ),
          )
          .limit(1);
        if (priorRequest) {
          if (priorRequest.fingerprint !== fingerprint)
            throw new ClassEnrollmentConflictError(
              "This report request key was already used with different content",
            );
          return toReport(report);
        }
      }

      const now = currentTime();
      if (!rawInput.deliveryConfirmed)
        throw new ClassEnrollmentInvalidOperationError(
          "Confirm delivery before submitting the class report",
        );
      if (report) {
        if (session.state !== "completed")
          throw new ClassEnrollmentConflictError(
            "Only a completed class session report can be edited",
          );
      } else {
        if (session.state !== "scheduled")
          throw new ClassEnrollmentConflictError(
            "Only a scheduled class session can receive its first report",
          );
        if (session.endAt > now)
          throw new ClassEnrollmentInvalidOperationError(
            "A class report can be submitted only after the session ends",
          );
        if (classRecord.state === "cancelled" && session.startAt > now)
          throw new ClassEnrollmentInvalidOperationError(
            "A future session in a cancelled class cannot be reported",
          );
        if (
          classRecord.state !== "cancelled" &&
          !["published", "postponed"].includes(classRecord.state)
        )
          throw new ClassEnrollmentInvalidOperationError(
            "This class is not accepting session reports",
          );
      }
      if (!report && rawInput.expectedVersion !== 0)
        throw new ClassEnrollmentConflictError(
          "The class session report is new; reload before submitting",
        );
      if (report && rawInput.expectedVersion !== report.version)
        throw new ClassEnrollmentConflictError(
          "The class session report changed; reload before editing",
        );

      if (!report) {
        for (const { allocation, amount } of settlement) {
          const studentWallet = wallets.find(
            (item) => item.userId === allocation.studentId,
          );
          if (!studentWallet)
            throw new ClassEnrollmentConflictError(
              "A funded student's wallet is unavailable",
            );
          await deps.wallet.deduct(tx, {
            walletId: studentWallet.id,
            amount,
            eventKey: `class-allocation:${allocation.id}:complete:deduct`,
            sourceReference: allocation.fundingSourceReference,
            actorType: actorRole as "admin" | "tutor",
            reason: "Class session completed",
          });
          await tx
            .update(academyClassEnrollmentAllocation)
            .set({ spentMarks: allocation.spentMarks + amount, updatedAt: now })
            .where(eq(academyClassEnrollmentAllocation.id, allocation.id));
        }
      }

      const nextVersion = report ? report.version + 1 : 1;
      const savedReport = report
        ? (
            await tx
              .update(academyClassSessionReport)
              .set({
                currentActorId: actorId,
                currentActorRole: actorRole as "admin" | "tutor",
                adminReason: adminReason ?? null,
                deliveryConfirmed: true,
                discussion: normalizedFeedback.discussion,
                strengths: normalizedFeedback.strengths,
                improvements: normalizedFeedback.improvements,
                version: nextVersion,
                updatedAt: now,
              })
              .where(
                and(
                  eq(academyClassSessionReport.id, report.id),
                  eq(
                    academyClassSessionReport.version,
                    rawInput.expectedVersion,
                  ),
                ),
              )
              .returning()
          )[0]
        : (
            await tx
              .insert(academyClassSessionReport)
              .values({
                id: randomUUID(),
                sessionId: session.id,
                deliveryTutorId: session.tutorId,
                currentActorId: actorId,
                currentActorRole: actorRole as "admin" | "tutor",
                adminReason: adminReason ?? null,
                deliveryConfirmed: true,
                discussion: normalizedFeedback.discussion,
                strengths: normalizedFeedback.strengths,
                improvements: normalizedFeedback.improvements,
                version: 1,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
          )[0];
      if (!savedReport)
        throw new ClassEnrollmentConflictError(
          "The class session report changed; reload before saving",
        );

      await tx.insert(academyClassSessionReportRevision).values({
        id: randomUUID(),
        reportId: savedReport.id,
        version: nextVersion,
        actorId,
        actorRole: actorRole as "admin" | "tutor",
        adminReason: adminReason ?? null,
        requestKey: rawInput.requestKey,
        fingerprint,
        deliveryConfirmed: true,
        discussion: normalizedFeedback.discussion,
        strengths: normalizedFeedback.strengths,
        improvements: normalizedFeedback.improvements,
        createdAt: now,
      });

      const collectedMarks = settlement.reduce(
        (total, item) => total + item.amount,
        0,
      );
      const deliveryLabel = `${classRecord.titleEn} · ${session.titleEn}`;
      let feeIdr: number | null = null;
      if (!report && settlement.length > 0) {
        feeIdr = session.tutorFeeIdr;
        await tx.insert(tutorSessionFee).values({
          id: randomUUID(),
          bookingId: null,
          bookingSessionId: null,
          academyClassSessionId: session.id,
          deliveryLabel,
          collectedMarks,
          tutorId: session.tutorId,
          scheduledStartAt: session.startAt,
          earnedAt: now,
          eventKey: `academy-class-session:${session.id}:earned-fee`,
          grossHonorariumIdr: session.tutorFeeIdr,
          priceSnapshot: null,
          createdAt: now,
        });
      }

      await tx
        .update(academyClassSession)
        .set({ state: "completed", updatedAt: now })
        .where(
          and(
            eq(academyClassSession.id, session.id),
            eq(academyClassSession.state, "scheduled"),
          ),
        );

      if (!report && deps.referralPort) {
        for (const { allocation, amount } of settlement) {
          // eslint-disable-next-line no-await-in-loop
          await deps.referralPort.recordEligibleFirstCompletion(tx, {
            studentId: allocation.studentId,
            completionType: classRecord.kind as "cohort" | "masterclass",
            completionId: session.id,
            completedAt: now,
            chargedMarks: amount,
          });
        }
      }

      const classSessions = await tx
        .select({ state: academyClassSession.state })
        .from(academyClassSession)
        .where(eq(academyClassSession.classId, classRecord.id));
      if (
        !report &&
        classRecord.state !== "cancelled" &&
        classSessions.every((item) =>
          ["completed", "cancelled"].includes(item.state),
        )
      ) {
        await tx
          .update(academyClass)
          .set({
            state: "completed",
            version: classRecord.version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(academyClass.id, classRecord.id),
              inArray(academyClass.state, ["published", "postponed"]),
            ),
          );
      }

      await tx.insert(auditLog).values({
        id: randomUUID(),
        actorId,
        actorType: actorRole,
        action: report
          ? "academy_class_session.report_updated"
          : "academy_class_session.report_submitted",
        targetId: savedReport.id,
        targetType: "academy_class_session_report",
        beforeState: report
          ? {
              version: report.version,
              discussion: report.discussion,
              strengths: report.strengths,
              improvements: report.improvements,
            }
          : null,
        afterState: {
          version: nextVersion,
          discussion: normalizedFeedback.discussion,
          strengths: normalizedFeedback.strengths,
          improvements: normalizedFeedback.improvements,
        },
        details: {
          sessionId: session.id,
          requestKey: rawInput.requestKey,
          fingerprint,
          deliveryConfirmed: true,
          adminReason: adminReason ?? null,
          deductedMarks: report ? 0 : collectedMarks,
          feeIdr,
        },
        createdAt: now,
      });

      if (!report) {
        const entitledStudentIds = [
          ...new Set(
            allocations
              .filter(
                (allocation) =>
                  allocation.state === "funded" && allocation.fundedMarks > 0,
              )
              .map((allocation) => allocation.studentId),
          ),
        ].toSorted();
        for (const studentId of entitledStudentIds) {
          await deps.notification.write({
            db: tx,
            userId: studentId,
            category: "booking",
            title: "Class session report available",
            body: `The report for ${deliveryLabel} is ready to view.`,
            eventKey: `academy-class-session:${session.id}:report:v${nextVersion}:student:${studentId}`,
            metadata: { classId: classRecord.id, sessionId: session.id },
          });
        }
      }
      if (actorRole === "admin") {
        await deps.notification.write({
          db: tx,
          userId: report?.deliveryTutorId ?? session.tutorId,
          category: "override",
          title: report
            ? "Class session report corrected"
            : "Class session report recorded",
          body: `An administrator ${report ? "corrected" : "recorded"} the report for ${deliveryLabel}. Reason: ${adminReason}.`,
          eventKey: `academy-class-session:${session.id}:admin-report:v${nextVersion}:tutor`,
          metadata: {
            classId: classRecord.id,
            sessionId: session.id,
            version: nextVersion,
          },
        });
      }

      return toReport(savedReport);
    });
  }

  async function listSessionReports(
    actorId: string,
    actorRole: ActorRole,
    rawInput: z.infer<typeof listClassSessionReportsInput>,
  ) {
    if (!["admin", "tutor", "student"].includes(actorRole))
      throw new ClassEnrollmentNotFoundError();
    const conditions = rawInput.classId
      ? [eq(academyClass.id, rawInput.classId)]
      : [];
    if (actorRole === "tutor")
      conditions.push(
        or(
          eq(academyClassSessionReport.deliveryTutorId, actorId),
          and(
            isNull(academyClassSessionReport.id),
            eq(academyClassSession.tutorId, actorId),
          ),
        )!,
      );
    if (actorRole === "student") {
      conditions.push(
        exists(
          deps.db
            .select({ one: sql`1` })
            .from(academyClassEnrollmentAllocation)
            .where(
              and(
                eq(
                  academyClassEnrollmentAllocation.sessionId,
                  academyClassSession.id,
                ),
                eq(academyClassEnrollmentAllocation.studentId, actorId),
                eq(academyClassEnrollmentAllocation.state, "funded"),
                gt(academyClassEnrollmentAllocation.fundedMarks, 0),
              ),
            ),
        ),
        exists(
          deps.db
            .select({ one: sql`1` })
            .from(academyClassSessionReport)
            .where(
              eq(academyClassSessionReport.sessionId, academyClassSession.id),
            ),
        ),
      );
    } else {
      conditions.push(
        inArray(academyClassSession.state, [
          "scheduled",
          "completed",
          "cancelled",
        ]),
      );
    }
    const rows = await deps.db
      .select({
        classId: academyClass.id,
        classTitle: academyClass.titleEn,
        classNumber: academyClass.classNumber,
        classKind: academyClass.kind,
        sessionId: academyClassSession.id,
        tutorId: academyClassSession.tutorId,
        sequenceNumber: academyClassSession.sequenceNumber,
        sessionTitle: academyClassSession.titleEn,
        startAt: academyClassSession.startAt,
        endAt: academyClassSession.endAt,
        mode: academyClassSession.mode,
        state: academyClassSession.state,
        absenceReportedAt: academyClassTutorAbsence.reportedAt,
        absenceLate: academyClassTutorAbsence.late,
        tutorFeeIdr: academyClassSession.tutorFeeIdr,
        reportId: academyClassSessionReport.id,
        reportVersion: academyClassSessionReport.version,
        discussion: academyClassSessionReport.discussion,
        strengths: academyClassSessionReport.strengths,
        improvements: academyClassSessionReport.improvements,
        reportCreatedAt: academyClassSessionReport.createdAt,
        reportUpdatedAt: academyClassSessionReport.updatedAt,
      })
      .from(academyClassSession)
      .innerJoin(academyClass, eq(academyClassSession.classId, academyClass.id))
      .leftJoin(
        academyClassSessionReport,
        eq(academyClassSessionReport.sessionId, academyClassSession.id),
      )
      .leftJoin(
        academyClassTutorAbsence,
        and(
          eq(academyClassTutorAbsence.sessionId, academyClassSession.id),
          eq(academyClassTutorAbsence.tutorId, academyClassSession.tutorId),
          eq(
            academyClassTutorAbsence.assignmentVersion,
            academyClassSession.version,
          ),
        ),
      )
      .where(and(...conditions))
      .orderBy(
        asc(academyClassSession.startAt),
        asc(academyClassSession.sequenceNumber),
        asc(academyClassSession.id),
      );
    const sessionIds = rows.map((row) => row.sessionId);
    let allocations: (typeof academyClassEnrollmentAllocation.$inferSelect)[] =
      [];
    let fees: {
      sessionId: string | null;
      collectedMarks: number;
      grossHonorariumIdr: number;
    }[] = [];
    if (actorRole !== "student" && sessionIds.length > 0) {
      [allocations, fees] = await Promise.all([
        deps.db
          .select()
          .from(academyClassEnrollmentAllocation)
          .where(
            inArray(academyClassEnrollmentAllocation.sessionId, sessionIds),
          ),
        deps.db
          .select({
            sessionId: tutorSessionFee.academyClassSessionId,
            collectedMarks: tutorSessionFee.collectedMarks,
            grossHonorariumIdr: tutorSessionFee.grossHonorariumIdr,
          })
          .from(tutorSessionFee)
          .where(inArray(tutorSessionFee.academyClassSessionId, sessionIds)),
      ]);
    }
    const allocationsBySession = new Map<
      string,
      (typeof academyClassEnrollmentAllocation.$inferSelect)[]
    >();
    for (const allocation of allocations) {
      const sessionAllocations =
        allocationsBySession.get(allocation.sessionId) ?? [];
      sessionAllocations.push(allocation);
      allocationsBySession.set(allocation.sessionId, sessionAllocations);
    }
    const feesBySession = new Map(fees.map((fee) => [fee.sessionId, fee]));
    return rows.map((row) => ({
      classId: row.classId,
      classTitle: row.classTitle,
      classNumber: row.classNumber,
      classKind: row.classKind as "cohort" | "masterclass",
      sessionId: row.sessionId,
      tutorId: row.tutorId,
      sequenceNumber: row.sequenceNumber,
      sessionTitle: row.sessionTitle,
      startAt: row.startAt,
      endAt: row.endAt,
      mode: row.mode as "online" | "in_person",
      state: row.state as "scheduled" | "completed" | "cancelled",
      absenceReportedAt: actorRole === "student" ? null : row.absenceReportedAt,
      absenceLate: actorRole === "student" ? null : row.absenceLate,
      report: row.reportId
        ? {
            id: row.reportId,
            sessionId: row.sessionId,
            version: row.reportVersion!,
            discussion: row.discussion!,
            strengths: row.strengths!,
            improvements: row.improvements!,
            createdAt: row.reportCreatedAt!,
            updatedAt: row.reportUpdatedAt!,
          }
        : null,
      settlement:
        actorRole === "student"
          ? null
          : row.reportId
            ? {
                deductedMarks:
                  feesBySession.get(row.sessionId)?.collectedMarks ?? 0,
                tutorFeeIdr:
                  feesBySession.get(row.sessionId)?.grossHonorariumIdr ?? 0,
                settled: true,
              }
            : (() => {
                const deductedMarks = classSessionSettlementAmounts(
                  allocationsBySession.get(row.sessionId) ?? [],
                ).reduce((total, item) => total + item.amount, 0);
                return {
                  deductedMarks,
                  tutorFeeIdr: deductedMarks > 0 ? row.tutorFeeIdr : 0,
                  settled: false,
                };
              })(),
    }));
  }

  return { submitSessionReport, listSessionReports };
}
