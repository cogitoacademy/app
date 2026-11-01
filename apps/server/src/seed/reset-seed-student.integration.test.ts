import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { db } from "@cogito-app/db";
import {
  academyClass,
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassEnrollmentTopUpAttempt,
  academyClassSession,
  ledgerEntry,
  paymentRecord,
  subjectCategory,
  user,
  wallet,
} from "@cogito-app/db/schema";
import { eq, sql } from "drizzle-orm";
import { resetSeedStudent } from "./reset-seed-student";
import { resolveSeedStudentResetTarget } from "./reset-seed-student.guard";

async function fixtureSnapshot() {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM "user") AS users,
      (SELECT count(*)::int FROM wallet) AS wallets,
      (SELECT coalesce(sum(total_balance + held_balance + available_balance), 0)::int FROM wallet) AS wallet_marks,
      (SELECT count(*)::int FROM ledger_entry) AS ledger_entries,
      (SELECT coalesce(sum(amount), 0)::int FROM ledger_entry) AS ledger_amount,
      (SELECT count(*)::int FROM academy_class_enrollment) AS enrollments,
      (SELECT count(*)::int FROM academy_class_enrollment_installment) AS installments,
      (SELECT count(*)::int FROM academy_class_enrollment_allocation) AS allocations,
      (SELECT coalesce(sum(funded_marks + spent_marks + released_marks), 0)::int FROM academy_class_enrollment_allocation) AS allocation_marks,
      (SELECT count(*)::int FROM academy_class_enrollment_top_up_attempt) AS top_up_attempts,
      (SELECT count(*)::int FROM payment_record) AS payments
  `);
  const rows = Array.isArray(result)
    ? result
    : ((result as unknown as { rows?: Record<string, number>[] }).rows ?? []);
  return rows[0];
}

class RollbackFixture extends Error {}

const t05ResetRegression = async () => {
  expect(resolveSeedStudentResetTarget(process.env)).toBe("t05");
  const before = await fixtureSnapshot();
  const ids = {
    student: randomUUID(),
    wallet: randomUUID(),
    class: randomUUID(),
    session: randomUUID(),
    enrollment: randomUUID(),
    installment: randomUUID(),
    allocation: randomUUID(),
    payment: randomUUID(),
    attempt: randomUUID(),
    ledger: randomUUID(),
  };
  const suffix = randomUUID().slice(0, 8);

  try {
    await db.transaction(async (tx) => {
      const [competition] = await tx
        .select({ id: subjectCategory.id })
        .from(subjectCategory)
        .where(eq(subjectCategory.isActive, true))
        .limit(1);
      const [tutor] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, "tutor"))
        .limit(1);
      if (!competition || !tutor) {
        throw new Error("T05 seed data is required for this integration test.");
      }

      const now = new Date();
      const sessionStart = new Date("2045-01-01T10:00:00.000Z");
      await tx.insert(user).values({
        id: ids.student,
        name: "Andre by Cogito",
        email: `cogito.e2e.reset-${suffix}@example.invalid`,
        emailVerified: true,
        role: "student",
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(wallet).values({
        id: ids.wallet,
        userId: ids.student,
        totalBalance: 245,
        heldBalance: 0,
        availableBalance: 245,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(academyClass).values({
        id: ids.class,
        kind: "cohort",
        competitionId: competition.id,
        titleEn: `T05 reset probe ${suffix}`,
        descriptionEn: "Synthetic fixture for the guarded reset regression.",
        minimumEnrollment: 1,
        minimumCheckAt: new Date("2044-01-01T00:00:00.000Z"),
        cohortFullRateMarks: 25,
        cohortHalfRateMarks: 25,
        cohortSingleRateMarks: 25,
        tutorFeeIdr: 400_000,
        state: "published",
        publishedAt: now,
        createdBy: tutor.id,
        updatedBy: tutor.id,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(academyClassSession).values({
        id: ids.session,
        classId: ids.class,
        sequenceNumber: 1,
        capacity: 1,
        titleEn: "Reset probe session",
        curriculumEn: "Synthetic fixture session.",
        startAt: sessionStart,
        endAt: new Date(sessionStart.getTime() + 60 * 60_000),
        mode: "online",
        tutorId: tutor.id,
        tutorFeeIdr: 400_000,
        state: "scheduled",
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(academyClassEnrollment).values({
        id: ids.enrollment,
        classId: ids.class,
        studentId: ids.student,
        requestKey: randomUUID(),
        plan: "single",
        state: "active",
        sessionCount: 1,
        firstRateMarks: 25,
        secondRateMarks: null,
        firstInstallmentMarks: 25,
        secondInstallmentMarks: 0,
        totalMarks: 25,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(academyClassEnrollmentInstallment).values({
        id: ids.installment,
        enrollmentId: ids.enrollment,
        ordinal: 1,
        rateMarks: 25,
        sessionCount: 1,
        amountMarks: 25,
        state: "funded",
        fundedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(academyClassEnrollmentAllocation).values({
        id: ids.allocation,
        enrollmentId: ids.enrollment,
        installmentId: ids.installment,
        classId: ids.class,
        sessionId: ids.session,
        studentId: ids.student,
        ordinal: 1,
        sequenceNumber: 1,
        rateMarks: 25,
        state: "released",
        fundingEventKey: `class-enrollment:${ids.enrollment}:session:${ids.session}:hold:v1`,
        fundingSourceReference: `academy-class-enrollment/${ids.enrollment}/allocation/${ids.allocation}`,
        fundedMarks: 25,
        spentMarks: 5,
        releasedMarks: 20,
        fundedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(paymentRecord).values({
        id: ids.payment,
        userId: ids.student,
        walletId: ids.wallet,
        provider: "stub",
        providerReference: `stub:v3:${ids.payment}`,
        amountIdr: 500_000,
        marks: 50,
        status: "PAID",
        providerIntentState: "READY",
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(academyClassEnrollmentTopUpAttempt).values({
        id: ids.attempt,
        installmentId: ids.installment,
        requestKey: randomUUID(),
        requestedMarks: 50,
        paymentId: ids.payment,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(ledgerEntry).values({
        id: ids.ledger,
        walletId: ids.wallet,
        eventKey: `stub-payment:${ids.payment}`,
        entryType: "credit",
        actorType: "system",
        amount: 50,
        beforeBalance: 195,
        afterBalance: 245,
        balanceAfterWalletTotal: 245,
        balanceAfterWalletHeld: 0,
        reason: "Synthetic E2E top-up fixture.",
        sourceReference: ids.payment,
        createdAt: now,
      });

      expect(await resetSeedStudent()).toBe("run-scoped");
      expect(await resetSeedStudent()).toBe("run-scoped");
      const [allocation] = await tx
        .select({ spentMarks: academyClassEnrollmentAllocation.spentMarks })
        .from(academyClassEnrollmentAllocation)
        .where(eq(academyClassEnrollmentAllocation.id, ids.allocation));
      const [attempt] = await tx
        .select({ paymentId: academyClassEnrollmentTopUpAttempt.paymentId })
        .from(academyClassEnrollmentTopUpAttempt)
        .where(eq(academyClassEnrollmentTopUpAttempt.id, ids.attempt));
      const [payment] = await tx
        .select({
          provider: paymentRecord.provider,
          status: paymentRecord.status,
        })
        .from(paymentRecord)
        .where(eq(paymentRecord.id, ids.payment));

      expect(allocation?.spentMarks).toBe(5);
      expect(attempt?.paymentId).toBe(ids.payment);
      expect(payment).toMatchObject({ provider: "stub", status: "PAID" });
      throw new RollbackFixture();
    });
  } catch (error) {
    if (!(error instanceof RollbackFixture)) throw error;
  }

  expect(await fixtureSnapshot()).toEqual(before);
};

describe("T05 seed-student reset integration", () => {
  const name =
    "6769 keeps prior class and payment facts intact and rolls the probe back";
  if (process.env.T05_ENROLLMENT_TEST_DB_PORT === "6769") {
    test(name, t05ResetRegression);
  } else {
    test.skip(name, t05ResetRegression);
  }
});
