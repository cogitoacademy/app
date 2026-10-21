import { db } from "@cogito-app/db";
import {
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassEnrollmentTopUpAttempt,
  user,
  wallet,
} from "@cogito-app/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  assertSeedStudentFixture,
  assertSupportedEnrollmentForeignKeys,
  resolveSeedStudentResetTarget,
  SEED_STUDENT_FIXTURE,
  type EnrollmentForeignKey,
} from "./reset-seed-student.guard";

async function reset() {
  const target = resolveSeedStudentResetTarget(process.env);
  if (target === "skip") {
    console.log("Seed student reset skipped for reserved DB port 6767/6768.");
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [seedStudent] = await tx
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      })
      .from(user)
      .where(eq(user.email, SEED_STUDENT_FIXTURE.email))
      .limit(1);

    if (!seedStudent) return "missing" as const;
    assertSeedStudentFixture(seedStudent);

    const [seedWallet] = await tx
      .select({ id: wallet.id })
      .from(wallet)
      .where(eq(wallet.userId, seedStudent.id))
      .limit(1);
    const walletId = seedWallet?.id;

    const enrollments =
      target === "t05"
        ? await tx
            .select({
              id: academyClassEnrollment.id,
              classId: academyClassEnrollment.classId,
            })
            .from(academyClassEnrollment)
            .where(eq(academyClassEnrollment.studentId, seedStudent.id))
        : [];
    const enrollmentIds = enrollments.map(({ id }) => id);

    if (enrollmentIds.length > 0) {
      if (!walletId) {
        throw new Error(
          "Seed student reset refused because the fixture wallet is missing.",
        );
      }

      const foreignKeys = (await tx.execute(sql`
        SELECT
          source.relname AS "sourceTable",
          target.relname AS "targetTable",
          constraint_row.conname AS "constraintName"
        FROM pg_catalog.pg_constraint AS constraint_row
        JOIN pg_catalog.pg_class AS source
          ON source.oid = constraint_row.conrelid
        JOIN pg_catalog.pg_namespace AS source_schema
          ON source_schema.oid = source.relnamespace
        JOIN pg_catalog.pg_class AS target
          ON target.oid = constraint_row.confrelid
        JOIN pg_catalog.pg_namespace AS target_schema
          ON target_schema.oid = target.relnamespace
        WHERE constraint_row.contype = 'f'
          AND source_schema.nspname = 'public'
          AND target_schema.nspname = 'public'
          AND target.relname IN (
            'academy_class_enrollment',
            'academy_class_enrollment_installment',
            'academy_class_enrollment_allocation',
            'academy_class_enrollment_top_up_attempt'
          )
      `)) as unknown as EnrollmentForeignKey[];
      assertSupportedEnrollmentForeignKeys(foreignKeys);

      const allocations = await tx
        .select({
          id: academyClassEnrollmentAllocation.id,
          enrollmentId: academyClassEnrollmentAllocation.enrollmentId,
          classId: academyClassEnrollmentAllocation.classId,
          studentId: academyClassEnrollmentAllocation.studentId,
          sessionId: academyClassEnrollmentAllocation.sessionId,
          fundingEventKey: academyClassEnrollmentAllocation.fundingEventKey,
          fundingSourceReference:
            academyClassEnrollmentAllocation.fundingSourceReference,
          spentMarks: academyClassEnrollmentAllocation.spentMarks,
        })
        .from(academyClassEnrollmentAllocation)
        .where(
          inArray(academyClassEnrollmentAllocation.enrollmentId, enrollmentIds),
        );
      const enrollmentClassIds = new Map(
        enrollments.map(({ id, classId }) => [id, classId]),
      );
      if (
        allocations.some(
          (allocation) =>
            allocation.studentId !== seedStudent.id ||
            allocation.classId !==
              enrollmentClassIds.get(allocation.enrollmentId) ||
            allocation.fundingEventKey !==
              `class-enrollment:${allocation.enrollmentId}:session:${allocation.sessionId}:hold:v1` ||
            allocation.fundingSourceReference !==
              `academy-class-enrollment/${allocation.enrollmentId}/allocation/${allocation.id}` ||
            allocation.spentMarks !== 0,
        )
      ) {
        throw new Error(
          "Seed student reset refused because a class allocation is mismatched or has recorded spending.",
        );
      }

      const installments = await tx
        .select({ id: academyClassEnrollmentInstallment.id })
        .from(academyClassEnrollmentInstallment)
        .where(
          inArray(
            academyClassEnrollmentInstallment.enrollmentId,
            enrollmentIds,
          ),
        );
      const installmentIds = installments.map(({ id }) => id);

      if (installmentIds.length > 0) {
        const [paidTopUp] = await tx
          .select({ id: academyClassEnrollmentTopUpAttempt.id })
          .from(academyClassEnrollmentTopUpAttempt)
          .innerJoin(
            academyClassEnrollmentInstallment,
            eq(
              academyClassEnrollmentTopUpAttempt.installmentId,
              academyClassEnrollmentInstallment.id,
            ),
          )
          .innerJoin(
            academyClassEnrollment,
            eq(
              academyClassEnrollmentInstallment.enrollmentId,
              academyClassEnrollment.id,
            ),
          )
          .where(
            and(
              eq(academyClassEnrollment.studentId, seedStudent.id),
              isNotNull(academyClassEnrollmentTopUpAttempt.paymentId),
            ),
          )
          .limit(1);

        if (paidTopUp) {
          throw new Error(
            "Seed student reset refused because a class top-up has a payment record.",
          );
        }

        await tx
          .delete(academyClassEnrollmentTopUpAttempt)
          .where(
            inArray(
              academyClassEnrollmentTopUpAttempt.installmentId,
              installmentIds,
            ),
          );
      }

      if (allocations.length > 0) {
        await tx
          .delete(academyClassEnrollmentAllocation)
          .where(
            inArray(
              academyClassEnrollmentAllocation.enrollmentId,
              enrollmentIds,
            ),
          );
      }

      if (installmentIds.length > 0) {
        await tx
          .delete(academyClassEnrollmentInstallment)
          .where(
            inArray(
              academyClassEnrollmentInstallment.enrollmentId,
              enrollmentIds,
            ),
          );
      }

      await tx
        .delete(academyClassEnrollment)
        .where(inArray(academyClassEnrollment.id, enrollmentIds));
    }

    if (walletId) {
      await tx.execute(
        sql`delete from ledger_entry where wallet_id = ${walletId}`,
      );
    }

    await tx.execute(
      sql`delete from booking_participant where user_id = ${seedStudent.id}`,
    );
    await tx.execute(
      sql`delete from booking where proposer_id = ${seedStudent.id}`,
    );

    if (walletId) {
      await tx
        .update(wallet)
        .set({ totalBalance: 200, availableBalance: 200, heldBalance: 0 })
        .where(eq(wallet.id, walletId));
    }

    return "reset" as const;
  });

  console.log(
    result === "missing"
      ? "Seed student does not exist yet; nothing to reset"
      : "Reset seed student state",
  );
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
