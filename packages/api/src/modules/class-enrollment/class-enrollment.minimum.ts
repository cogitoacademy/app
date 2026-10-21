import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  academyClass,
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassMeeting,
  academyClassSession,
  academyClassSessionReport,
  auditLog,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { lockRoomForBooking, lockTutorForBooking } from "../../lib/locks";
import {
  ClassEnrollmentConflictError,
  ClassEnrollmentInvalidOperationError,
  ClassEnrollmentNotFoundError,
} from "./class-enrollment.errors";
import { remainingAllocationMarks } from "./class-enrollment.funding";
import { createAcademyClassRepo } from "../academy-class/academy-class.repo";
import {
  BOOKING_STATES,
  TERMINAL_STATES,
} from "../booking/booking-state.types";
import type { NotificationService } from "../notification/notification.service";
import {
  adminClassMinimumCheckOutput,
  adminClassMinimumDecisionOutput,
  type adminClassMinimumDecisionInput,
  type confirmAdminClassMinimumDecisionInput,
} from "./class-enrollment.types";
import type { z } from "zod";

const EXIT_WINDOW_MS = 72 * 60 * 60 * 1000;
const ACTIVE_BOOKING_STATES = BOOKING_STATES.filter(
  (state) => !TERMINAL_STATES.includes(state),
);

type CohortClassRecord = typeof academyClass.$inferSelect & {
  minimumCheckAt: Date;
  minimumEnrollment: number;
};

export function createClassMinimumLifecycle(deps: {
  db: DbType;
  notification: Pick<NotificationService, "write">;
  clock?: () => Date;
}) {
  const classRepo = createAcademyClassRepo();
  const currentTime = () => deps.clock?.() ?? new Date();

  function countActiveFullHalfStudents(
    classRecord: typeof academyClass.$inferSelect,
    enrollments: (typeof academyClassEnrollment.$inferSelect)[],
    installments: (typeof academyClassEnrollmentInstallment.$inferSelect)[],
    allocations: (typeof academyClassEnrollmentAllocation.$inferSelect)[],
    sessions: (typeof academyClassSession.$inferSelect)[],
  ) {
    const active = enrollments.filter(
      (enrollment) =>
        enrollment.state === "active" &&
        (enrollment.plan === "full" || enrollment.plan === "half") &&
        !installments.some(
          (installment) =>
            installment.enrollmentId === enrollment.id &&
            installment.state === "defaulted",
        ) &&
        allocations.some((allocation) => {
          const session = sessions.find(
            (item) => item.id === allocation.sessionId,
          );
          return (
            allocation.enrollmentId === enrollment.id &&
            allocation.classId === classRecord.id &&
            allocation.state === "funded" &&
            session?.state === "scheduled" &&
            remainingAllocationMarks(allocation) > 0
          );
        }),
    );
    return new Set(active.map((enrollment) => enrollment.studentId)).size;
  }

  async function loadClassMinimum(
    conn: DbOrTx,
    classId: string,
    lock = false,
  ): Promise<CohortClassRecord> {
    const query = conn
      .select()
      .from(academyClass)
      .where(eq(academyClass.id, classId))
      .limit(1);
    const [classRecord] = lock ? await query.for("update") : await query;
    if (!classRecord) throw new ClassEnrollmentNotFoundError();
    if (
      classRecord.kind !== "cohort" ||
      classRecord.minimumCheckAt === null ||
      classRecord.minimumEnrollment === null
    )
      throw new ClassEnrollmentInvalidOperationError(
        "Minimum enrollment checks apply to cohort classes only",
      );
    return classRecord as CohortClassRecord;
  }

  async function listLifecycleRows(
    conn: DbOrTx,
    classId: string,
    lock: boolean,
  ) {
    const sessionsQuery = conn
      .select()
      .from(academyClassSession)
      .where(eq(academyClassSession.classId, classId))
      .orderBy(asc(academyClassSession.id));
    const sessions = lock
      ? await sessionsQuery.for("update")
      : await sessionsQuery;
    const enrollmentsQuery = conn
      .select()
      .from(academyClassEnrollment)
      .where(eq(academyClassEnrollment.classId, classId))
      .orderBy(asc(academyClassEnrollment.id));
    const enrollments = lock
      ? await enrollmentsQuery.for("update")
      : await enrollmentsQuery;
    const enrollmentIds = enrollments.map((row) => row.id);
    const installmentsQuery = enrollmentIds.length
      ? conn
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
      : null;
    const installments = installmentsQuery
      ? lock
        ? await installmentsQuery.for("update")
        : await installmentsQuery
      : [];
    const allocationsQuery = enrollmentIds.length
      ? conn
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
      : null;
    const allocations = allocationsQuery
      ? lock
        ? await allocationsQuery.for("update")
        : await allocationsQuery
      : [];
    return { sessions, enrollments, installments, allocations };
  }

  async function getMinimumCheck(classId: string) {
    return deps.db.transaction(async (tx) => {
      const classRecord = await loadClassMinimum(tx, classId);
      const rows = await listLifecycleRows(tx, classId, false);
      const activeFullHalfStudents = countActiveFullHalfStudents(
        classRecord,
        rows.enrollments,
        rows.installments,
        rows.allocations,
        rows.sessions,
      );
      const now = currentTime();
      return adminClassMinimumCheckOutput.parse({
        classId: classRecord.id,
        classVersion: classRecord.version,
        minimumCheckAt: classRecord.minimumCheckAt,
        checkedAt: now,
        proposedFreeExitUntil:
          classRecord.state === "published" &&
          classRecord.minimumCheckResolvedAt === null &&
          classRecord.minimumCheckAt <= now
            ? new Date(now.getTime() + EXIT_WINDOW_MS)
            : null,
        minimumCheckResolvedAt: classRecord.minimumCheckResolvedAt,
        minimumEnrollment: classRecord.minimumEnrollment,
        activeFullHalfStudents,
        shortfall: Math.max(
          0,
          classRecord.minimumEnrollment - activeFullHalfStudents,
        ),
        eligible:
          classRecord.state === "published" &&
          classRecord.minimumCheckResolvedAt === null &&
          classRecord.minimumCheckAt <= now,
        postponementCount: classRecord.postponementCount,
        freeExitUntil: classRecord.freeExitUntil,
      });
    });
  }

  async function loadDecisionQuote(
    tx: DbOrTx,
    input: z.infer<typeof adminClassMinimumDecisionInput>,
  ) {
    const classRecord = await loadClassMinimum(tx, input.classId, true);
    if (input.decision === "postpone" && classRecord.postponementCount >= 1)
      throw new ClassEnrollmentInvalidOperationError(
        "A cohort can be postponed only once",
      );
    if (classRecord.state !== "published")
      throw new ClassEnrollmentInvalidOperationError(
        "Only a published cohort at its minimum check can continue or postpone",
      );
    if (classRecord.version !== input.expectedClassVersion)
      throw new ClassEnrollmentConflictError(
        "The class changed; reload its minimum check before continuing",
      );
    if (classRecord.minimumCheckResolvedAt !== null)
      throw new ClassEnrollmentConflictError(
        "This cohort minimum check has already been resolved",
      );

    const rows = await listLifecycleRows(tx, input.classId, true);
    let decisionAt = currentTime();
    if (classRecord.minimumCheckAt > decisionAt)
      throw new ClassEnrollmentInvalidOperationError(
        "The cohort minimum check is not due yet",
      );
    const activeFullHalfStudents = countActiveFullHalfStudents(
      classRecord,
      rows.enrollments,
      rows.installments,
      rows.allocations,
      rows.sessions,
    );
    const shortfall = Math.max(
      0,
      classRecord.minimumEnrollment! - activeFullHalfStudents,
    );
    const scheduledSessions = rows.sessions
      .filter((session) => session.state === "scheduled")
      .toSorted(
        (left, right) =>
          left.sequenceNumber - right.sequenceNumber ||
          left.id.localeCompare(right.id),
      );
    let replacementSessions: {
      sessionId: string;
      startAt: Date;
      endAt: Date;
      version: number;
    }[] = [];
    let freeExitUntil: Date | null = null;
    if (input.decision === "postpone") {
      if (rows.sessions.some((session) => session.state === "completed"))
        throw new ClassEnrollmentInvalidOperationError(
          "A cohort with delivered sessions cannot be postponed; past reports and fees remain unchanged",
        );
      if (scheduledSessions.some((session) => session.startAt <= decisionAt))
        throw new ClassEnrollmentInvalidOperationError(
          "A cohort with an ongoing or past scheduled session cannot be postponed",
        );
      if (input.replacementStarts.length !== scheduledSessions.length)
        throw new ClassEnrollmentInvalidOperationError(
          "Enter a replacement start time for every scheduled session",
        );
      const startsById = new Map(
        input.replacementStarts.map((replacement) => [
          replacement.sessionId,
          replacement,
        ]),
      );
      if (
        startsById.size !== scheduledSessions.length ||
        scheduledSessions.some((session) => !startsById.has(session.id))
      )
        throw new ClassEnrollmentInvalidOperationError(
          "Replacement times must include each currently scheduled session exactly once",
        );
      const windowEnd = new Date(decisionAt.getTime() + EXIT_WINDOW_MS);
      for (const session of scheduledSessions) {
        const replacement = startsById.get(session.id)!;
        if (replacement.expectedSessionVersion !== session.version)
          throw new ClassEnrollmentConflictError(
            "A session changed; reload the replacement schedule",
          );
        if (replacement.startAt <= windowEnd)
          throw new ClassEnrollmentInvalidOperationError(
            "Every replacement session must start after the 72-hour free-exit deadline",
          );
        const duration = session.endAt.getTime() - session.startAt.getTime();
        replacementSessions.push({
          sessionId: session.id,
          startAt: replacement.startAt,
          endAt: new Date(replacement.startAt.getTime() + duration),
          version: session.version + 1,
        });
      }
      for (let index = 1; index < scheduledSessions.length; index += 1) {
        const previous = replacementSessions[index - 1]!;
        const current = replacementSessions[index]!;
        if (current.startAt < previous.endAt)
          throw new ClassEnrollmentInvalidOperationError(
            "Replacement sessions cannot overlap or change their order",
          );
      }
      freeExitUntil = windowEnd;
      await validateReplacementConflicts(
        tx,
        scheduledSessions,
        replacementSessions,
        classRecord.id,
      );
    }

    const reports = rows.sessions.length
      ? await tx
          .select({
            sessionId: academyClassSessionReport.sessionId,
            reportId: academyClassSessionReport.id,
            reportVersion: academyClassSessionReport.version,
          })
          .from(academyClassSessionReport)
          .where(
            inArray(
              academyClassSessionReport.sessionId,
              rows.sessions.map((session) => session.id),
            ),
          )
      : [];
    decisionAt = currentTime();
    if (
      input.decision === "postpone" &&
      scheduledSessions.some((session) => session.startAt <= decisionAt)
    )
      throw new ClassEnrollmentConflictError(
        "A scheduled session started while the replacement schedule was being reviewed",
      );
    if (input.decision === "postpone") {
      freeExitUntil = new Date(decisionAt.getTime() + EXIT_WINDOW_MS);
      if (
        replacementSessions.some((session) => session.startAt <= freeExitUntil!)
      )
        throw new ClassEnrollmentConflictError(
          "The 72-hour deadline moved while the replacement schedule was being reviewed. Move every session after the updated deadline and review again",
        );
    }
    const quoteBase = {
      classId: classRecord.id,
      classVersion: classRecord.version,
      decision: input.decision,
      reason: input.reason,
      minimumEnrollment: classRecord.minimumEnrollment,
      activeFullHalfStudents,
      shortfall,
      replacementSessions,
    };
    const quote = adminClassMinimumDecisionOutput.parse({
      ...quoteBase,
      classVersion: classRecord.version + 1,
      freeExitUntil,
      quoteVersion: createHash("sha256")
        .update(
          JSON.stringify({
            quoteBase,
            class: {
              id: classRecord.id,
              state: classRecord.state,
              version: classRecord.version,
              minimumCheckAt: classRecord.minimumCheckAt,
              minimumCheckResolvedAt: classRecord.minimumCheckResolvedAt,
              postponementCount: classRecord.postponementCount,
              freeExitUntil: classRecord.freeExitUntil,
            },
            sessions: rows.sessions.map((session) => ({
              id: session.id,
              version: session.version,
              state: session.state,
              startAt: session.startAt,
              endAt: session.endAt,
            })),
            enrollments: rows.enrollments.map((enrollment) => ({
              id: enrollment.id,
              studentId: enrollment.studentId,
              plan: enrollment.plan,
              state: enrollment.state,
              firstRateMarks: enrollment.firstRateMarks,
              secondRateMarks: enrollment.secondRateMarks,
              totalMarks: enrollment.totalMarks,
            })),
            installments: rows.installments.map((installment) => ({
              id: installment.id,
              state: installment.state,
              rateMarks: installment.rateMarks,
              sessionCount: installment.sessionCount,
              amountMarks: installment.amountMarks,
              dueSessionId: installment.dueSessionId,
              dueAt: installment.dueAt,
            })),
            allocations: rows.allocations.map((allocation) => ({
              id: allocation.id,
              sessionId: allocation.sessionId,
              installmentId: allocation.installmentId,
              rateMarks: allocation.rateMarks,
              state: allocation.state,
              fundedMarks: allocation.fundedMarks,
              spentMarks: allocation.spentMarks,
              releasedMarks: allocation.releasedMarks,
              fundingEventKey: allocation.fundingEventKey,
              fundingSourceReference: allocation.fundingSourceReference,
            })),
            reports,
          }),
        )
        .digest("hex"),
    });
    return { classRecord, rows, now: decisionAt, quote };
  }

  async function validateReplacementConflicts(
    tx: DbOrTx,
    currentSessions: (typeof academyClassSession.$inferSelect)[],
    replacements: {
      sessionId: string;
      startAt: Date;
      endAt: Date;
      version: number;
    }[],
    classId: string,
  ) {
    const sessions = new Map(
      currentSessions.map((session) => [session.id, session]),
    );
    const tutorIds = [
      ...new Set(currentSessions.map((session) => session.tutorId)),
    ].toSorted();
    const roomIds = [
      ...new Set(
        currentSessions.flatMap((session) =>
          session.roomId === null ? [] : [session.roomId],
        ),
      ),
    ].toSorted();
    for (const tutorId of tutorIds) {
      // Match class publishing's shared resource-lock order.
      await lockTutorForBooking(tx, tutorId);
    }
    for (const roomId of roomIds) {
      await lockRoomForBooking(tx, roomId);
    }
    for (const replacement of replacements) {
      const session = sessions.get(replacement.sessionId)!;
      if (session.roomId) {
        const bookingOverlap = await classRepo.findRoomBookingOverlap(
          tx,
          session.roomId,
          replacement.startAt,
          replacement.endAt,
        );
        const classOverlap = await classRepo.findRoomClassOverlap(
          tx,
          classId,
          session.roomId,
          replacement.startAt,
          replacement.endAt,
        );
        if (bookingOverlap || classOverlap)
          throw new ClassEnrollmentInvalidOperationError(
            "A replacement session conflicts with an existing managed-room reservation",
          );
      }
      const bookingOverlap = await classRepo.findTutorBookingOverlap(
        tx,
        session.tutorId,
        replacement.startAt,
        replacement.endAt,
        ACTIVE_BOOKING_STATES,
      );
      const classOverlap = await classRepo.findTutorClassOverlap(
        tx,
        classId,
        session.tutorId,
        replacement.startAt,
        replacement.endAt,
      );
      if (bookingOverlap || classOverlap)
        throw new ClassEnrollmentInvalidOperationError(
          "A replacement session conflicts with another tutor session",
        );
    }
  }

  async function previewMinimumDecision(
    input: z.infer<typeof adminClassMinimumDecisionInput>,
  ) {
    return deps.db.transaction(async (tx) => {
      const { quote } = await loadDecisionQuote(tx, input);
      return quote;
    });
  }

  async function confirmMinimumDecision(
    actorId: string,
    input: z.infer<typeof confirmAdminClassMinimumDecisionInput>,
  ) {
    return deps.db.transaction(async (tx) => {
      const classRecord = await loadClassMinimum(tx, input.classId, true);
      const action =
        input.decision === "continue"
          ? "academy_class.minimum_continued"
          : "academy_class.minimum_postponed";
      const [receipt] = await tx
        .select({ details: auditLog.details })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, input.classId),
            eq(auditLog.action, action),
            sql`${auditLog.details}->>'requestKey' = ${input.requestKey}`,
          ),
        )
        .limit(1);
      if (receipt) {
        const saved = adminClassMinimumDecisionOutput.parse(
          receipt.details?.quote,
        );
        if (
          saved.classId !== input.classId ||
          saved.decision !== input.decision ||
          saved.classVersion !== input.expectedClassVersion + 1 ||
          saved.quoteVersion !== input.quoteVersion ||
          receipt.details?.reason !== input.reason
        )
          throw new ClassEnrollmentConflictError(
            "This minimum decision request key was already used",
          );
        return saved;
      }
      const result = await loadDecisionQuote(tx, input);
      if (result.quote.quoteVersion !== input.quoteVersion)
        throw new ClassEnrollmentConflictError(
          "Enrollment, payments, reports, or the schedule changed; review a fresh minimum decision",
        );
      const { rows, now, quote } = result;
      const actualFreeExitUntil =
        input.decision === "postpone"
          ? new Date(now.getTime() + EXIT_WINDOW_MS)
          : null;
      if (
        input.decision === "postpone" &&
        quote.replacementSessions.some(
          (session) => session.startAt <= actualFreeExitUntil!,
        )
      )
        throw new ClassEnrollmentConflictError(
          "The 72-hour deadline moved while you were reviewing. Move every replacement session after the updated deadline and review again",
        );

      const replacementById = new Map(
        quote.replacementSessions.map((session) => [
          session.sessionId,
          session,
        ]),
      );
      const changedSessions =
        input.decision === "postpone"
          ? rows.sessions.filter((session) => replacementById.has(session.id))
          : [];
      const nextSessions: typeof quote.replacementSessions = [];
      for (const session of changedSessions) {
        const replacement = replacementById.get(session.id)!;
        const [saved] = await tx
          .update(academyClassSession)
          .set({
            startAt: replacement.startAt,
            endAt: replacement.endAt,
            version: session.version + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(academyClassSession.id, session.id),
              eq(academyClassSession.version, session.version),
              eq(academyClassSession.state, "scheduled"),
            ),
          )
          .returning({
            id: academyClassSession.id,
            startAt: academyClassSession.startAt,
            endAt: academyClassSession.endAt,
            version: academyClassSession.version,
          });
        if (!saved)
          throw new ClassEnrollmentConflictError(
            "A session changed while the replacement schedule was being saved",
          );
        nextSessions.push({
          sessionId: saved.id,
          startAt: saved.startAt,
          endAt: saved.endAt,
          version: saved.version,
        });
      }
      if (changedSessions.length > 0) {
        const dueSessionIds = changedSessions.map((session) => session.id);
        const pendingInstallments = rows.installments.filter(
          (installment) =>
            installment.state === "pending" &&
            installment.dueSessionId !== null &&
            dueSessionIds.includes(installment.dueSessionId),
        );
        for (const installment of pendingInstallments) {
          const schedule = nextSessions.find(
            (session) => session.sessionId === installment.dueSessionId,
          );
          if (!schedule) continue;
          await tx
            .update(academyClassEnrollmentInstallment)
            .set({
              dueAt: schedule.startAt,
              reminder7dProcessedAt: null,
              reminder7dForAt: null,
              reminder1dProcessedAt: null,
              reminder1dForAt: null,
              updatedAt: now,
            })
            .where(eq(academyClassEnrollmentInstallment.id, installment.id));
        }
        await tx
          .update(academyClassMeeting)
          .set({ nextRetryAt: now, updatedAt: now })
          .where(
            and(
              inArray(academyClassMeeting.sessionId, dueSessionIds),
              inArray(academyClassMeeting.status, [
                "pending",
                "failed",
                "created",
              ]),
            ),
          );
      }

      const nextVersion = classRecord.version + 1;
      const [updatedClass] = await tx
        .update(academyClass)
        .set({
          state: input.decision === "postpone" ? "postponed" : "published",
          postponementCount:
            input.decision === "postpone" ? 1 : classRecord.postponementCount,
          minimumCheckResolvedAt: now,
          freeExitUntil: actualFreeExitUntil,
          version: nextVersion,
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
          "The class changed while the minimum decision was being saved",
        );

      const savedQuote = adminClassMinimumDecisionOutput.parse({
        ...quote,
        classVersion: updatedClass.version,
        freeExitUntil: actualFreeExitUntil,
        replacementSessions: nextSessions,
      });
      await tx.insert(auditLog).values({
        actorId,
        actorType: "admin",
        action,
        targetId: classRecord.id,
        targetType: "academy_class",
        beforeState: {
          state: classRecord.state,
          version: classRecord.version,
          minimumCheckResolvedAt: classRecord.minimumCheckResolvedAt,
          postponementCount: classRecord.postponementCount,
          freeExitUntil: classRecord.freeExitUntil,
          sessions: rows.sessions.map((session) => ({
            sessionId: session.id,
            version: session.version,
            state: session.state,
            startAt: session.startAt,
            endAt: session.endAt,
          })),
        },
        afterState: {
          state: input.decision === "postpone" ? "postponed" : "published",
          version: updatedClass.version,
          minimumCheckResolvedAt: now,
          postponementCount:
            input.decision === "postpone" ? 1 : classRecord.postponementCount,
          freeExitUntil: actualFreeExitUntil,
          sessions: savedQuote.replacementSessions,
        },
        details: {
          requestKey: input.requestKey,
          reason: input.reason,
          minimumEnrollment: quote.minimumEnrollment,
          activeFullHalfStudents: quote.activeFullHalfStudents,
          shortfall: quote.shortfall,
          quote: savedQuote,
        },
        createdAt: now,
      });

      const studentIds = [
        ...new Set(
          rows.enrollments
            .filter((enrollment) =>
              ["active", "checkout_pending"].includes(enrollment.state),
            )
            .map((enrollment) => enrollment.studentId),
        ),
      ].toSorted();
      const sessionRows = rows.sessions.filter(
        (session) => session.state === "scheduled",
      );
      const deadlineLabel = actualFreeExitUntil
        ? new Intl.DateTimeFormat("en", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: "Asia/Jakarta",
          }).format(actualFreeExitUntil)
        : null;
      for (const studentId of studentIds) {
        await deps.notification.write({
          db: tx,
          userId: studentId,
          category: "schedule",
          severity: "action",
          emailRequired: true,
          title:
            input.decision === "postpone"
              ? "Cohort postponed once"
              : "Cohort minimum check complete",
          body:
            input.decision === "postpone"
              ? `${classRecord.titleEn} has a replacement schedule. You may withdraw without a cancellation fee until ${deadlineLabel} WIB. The new first session starts after this deadline. Existing session prices and funding history are preserved.`
              : `${classRecord.titleEn} will continue after its minimum enrollment check (${quote.activeFullHalfStudents}/${quote.minimumEnrollment} active paid full/half-plan students). Reason: ${input.reason}`,
          eventKey: `class:${classRecord.id}:minimum:${input.decision}:v${updatedClass.version}:student:${studentId}`,
          metadata: {
            classId: classRecord.id,
            decision: input.decision,
            freeExitUntil: actualFreeExitUntil?.toISOString() ?? null,
          },
        });
      }
      for (const tutorId of [
        ...new Set(sessionRows.map((session) => session.tutorId)),
      ].toSorted()) {
        await deps.notification.write({
          db: tx,
          userId: tutorId,
          category: "schedule",
          severity: "action",
          emailRequired: true,
          title:
            input.decision === "postpone"
              ? "Cohort schedule postponed"
              : "Cohort minimum check complete",
          body:
            input.decision === "postpone"
              ? `${classRecord.titleEn} has a new schedule. Student penalty-free withdrawal ends ${deadlineLabel} WIB. Calendar updates will retry automatically if needed. Reason: ${input.reason}`
              : `${classRecord.titleEn} will continue after its minimum enrollment check. Reason: ${input.reason}`,
          eventKey: `class:${classRecord.id}:minimum:${input.decision}:v${updatedClass.version}:tutor:${tutorId}`,
          metadata: {
            classId: classRecord.id,
            decision: input.decision,
            freeExitUntil: actualFreeExitUntil?.toISOString() ?? null,
          },
        });
      }
      return savedQuote;
    });
  }

  return {
    getMinimumCheck,
    preview: previewMinimumDecision,
    confirm: confirmMinimumDecision,
  };
}
