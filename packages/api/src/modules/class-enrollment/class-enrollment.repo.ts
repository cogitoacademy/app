import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  academyClass,
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassEnrollmentTopUpAttempt,
  academyClassSession,
  wallet,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  assertAllocationCanBeFunded,
  planAllocationRelease,
} from "./class-enrollment.funding";

const BLOCKING_ALLOCATION_STATES = [
  "checkout_reserved",
  "unfunded_reserved",
  "funded",
] as const;

export function createClassEnrollmentRepo() {
  async function getClassForEnrollment(
    conn: DbOrTx,
    classId: string,
    lock = false,
  ) {
    const query = conn
      .select({
        id: academyClass.id,
        kind: academyClass.kind,
        state: academyClass.state,
        cohortFullRateMarks: academyClass.cohortFullRateMarks,
        cohortHalfRateMarks: academyClass.cohortHalfRateMarks,
        cohortSingleRateMarks: academyClass.cohortSingleRateMarks,
        masterclassRateMarks: academyClass.masterclassRateMarks,
      })
      .from(academyClass)
      .where(eq(academyClass.id, classId))
      .limit(1);
    // Serialize class enrollment quotes by class so the same request key
    // cannot race with a distinct session selection into a unique violation.
    const [record] = lock ? await query.for("update") : await query;
    return record ?? null;
  }

  async function listClassSessions(conn: DbOrTx, classId: string) {
    return conn
      .select({
        id: academyClassSession.id,
        sequenceNumber: academyClassSession.sequenceNumber,
        startAt: academyClassSession.startAt,
        state: academyClassSession.state,
        capacity: academyClassSession.capacity,
      })
      .from(academyClassSession)
      .where(eq(academyClassSession.classId, classId))
      .orderBy(
        asc(academyClassSession.startAt),
        asc(academyClassSession.sequenceNumber),
        asc(academyClassSession.id),
      );
  }

  async function lockSessions(conn: DbOrTx, sessionIds: readonly string[]) {
    if (sessionIds.length === 0) return [];
    return conn
      .select({
        id: academyClassSession.id,
        classId: academyClassSession.classId,
        sequenceNumber: academyClassSession.sequenceNumber,
        startAt: academyClassSession.startAt,
        state: academyClassSession.state,
        capacity: academyClassSession.capacity,
      })
      .from(academyClassSession)
      .where(inArray(academyClassSession.id, [...sessionIds]))
      .orderBy(asc(academyClassSession.id))
      .for("update");
  }

  async function getSessionDueInfo(conn: DbOrTx, sessionId: string) {
    const [record] = await conn
      .select({
        id: academyClassSession.id,
        startAt: academyClassSession.startAt,
        state: academyClassSession.state,
      })
      .from(academyClassSession)
      .where(eq(academyClassSession.id, sessionId))
      .limit(1);
    return record ?? null;
  }

  async function findEnrollmentByRequestKey(
    conn: DbOrTx,
    studentId: string,
    requestKey: string,
    lock = false,
  ) {
    const query = conn
      .select()
      .from(academyClassEnrollment)
      .where(
        and(
          eq(academyClassEnrollment.studentId, studentId),
          eq(academyClassEnrollment.requestKey, requestKey),
        ),
      )
      .limit(1);
    const [record] = lock ? await query.for("update") : await query;
    return record ?? null;
  }

  async function lockEnrollmentRequestKey(
    conn: DbOrTx,
    studentId: string,
    requestKey: string,
  ) {
    // The request key is unique per student across classes. Class row locks
    // cannot serialize retries that accidentally reuse one key for two classes.
    await conn.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${studentId}:${requestKey}`}, 0))`,
    );
  }

  async function findEnrollment(
    conn: DbOrTx,
    studentId: string,
    enrollmentId: string,
    lock = false,
  ) {
    const query = conn
      .select()
      .from(academyClassEnrollment)
      .where(
        and(
          eq(academyClassEnrollment.studentId, studentId),
          eq(academyClassEnrollment.id, enrollmentId),
        ),
      )
      .limit(1);
    const [record] = lock ? await query.for("update") : await query;
    return record ?? null;
  }

  async function findEnrollmentById(
    conn: DbOrTx,
    enrollmentId: string,
    lock = false,
  ) {
    const query = conn
      .select()
      .from(academyClassEnrollment)
      .where(eq(academyClassEnrollment.id, enrollmentId))
      .limit(1);
    const [record] = lock ? await query.for("update") : await query;
    return record ?? null;
  }

  async function findStudentClassEnrollments(
    conn: DbOrTx,
    studentId: string,
    classId: string,
  ) {
    return conn
      .select()
      .from(academyClassEnrollment)
      .where(
        and(
          eq(academyClassEnrollment.studentId, studentId),
          eq(academyClassEnrollment.classId, classId),
        ),
      )
      .orderBy(
        desc(academyClassEnrollment.createdAt),
        desc(academyClassEnrollment.id),
      );
  }

  async function findStudentClassRecords(
    conn: DbOrTx,
    studentId: string,
    classId: string,
  ) {
    const enrollments = await findStudentClassEnrollments(
      conn,
      studentId,
      classId,
    );
    const enrollmentIds = enrollments.map((row) => row.id);
    if (enrollmentIds.length === 0) {
      return { enrollments, installments: [], allocations: [] };
    }
    const [installments, allocations] = await Promise.all([
      conn
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
        ),
      conn
        .select()
        .from(academyClassEnrollmentAllocation)
        .where(
          inArray(academyClassEnrollmentAllocation.enrollmentId, enrollmentIds),
        )
        .orderBy(
          asc(academyClassEnrollmentAllocation.enrollmentId),
          asc(academyClassEnrollmentAllocation.ordinal),
        ),
    ]);
    return { enrollments, installments, allocations };
  }

  async function findBlockingAllocationForSessions(
    conn: DbOrTx,
    studentId: string,
    sessionIds: readonly string[],
  ) {
    if (sessionIds.length === 0) return [];
    return conn
      .select({
        id: academyClassEnrollmentAllocation.id,
        sessionId: academyClassEnrollmentAllocation.sessionId,
      })
      .from(academyClassEnrollmentAllocation)
      .where(
        and(
          eq(academyClassEnrollmentAllocation.studentId, studentId),
          inArray(academyClassEnrollmentAllocation.sessionId, [...sessionIds]),
          inArray(academyClassEnrollmentAllocation.state, [
            ...BLOCKING_ALLOCATION_STATES,
          ]),
        ),
      );
  }

  async function expireStaleCheckoutsForSessions(
    conn: DbOrTx,
    sessionIds: readonly string[],
    now: Date,
  ) {
    if (sessionIds.length === 0) return 0;
    const candidates = await conn
      .select({ enrollmentId: academyClassEnrollmentAllocation.enrollmentId })
      .from(academyClassEnrollmentAllocation)
      .where(
        and(
          inArray(academyClassEnrollmentAllocation.sessionId, [...sessionIds]),
          eq(academyClassEnrollmentAllocation.state, "checkout_reserved"),
        ),
      );
    const ids = [
      ...new Set(candidates.map((row) => row.enrollmentId)),
    ].toSorted();
    if (ids.length === 0) return 0;

    const locked = await conn
      .select({
        id: academyClassEnrollment.id,
        state: academyClassEnrollment.state,
        checkoutExpiresAt: academyClassEnrollment.checkoutExpiresAt,
      })
      .from(academyClassEnrollment)
      .where(inArray(academyClassEnrollment.id, ids))
      .orderBy(asc(academyClassEnrollment.id))
      .for("update");
    const expiredIds = locked
      .filter(
        (row) =>
          row.state === "checkout_pending" &&
          row.checkoutExpiresAt !== null &&
          row.checkoutExpiresAt <= now,
      )
      .map((row) => row.id);
    if (expiredIds.length === 0) return 0;

    for (const enrollmentId of expiredIds) {
      const enrollmentAllocations = await conn
        .select()
        .from(academyClassEnrollmentAllocation)
        .where(eq(academyClassEnrollmentAllocation.enrollmentId, enrollmentId))
        .orderBy(asc(academyClassEnrollmentAllocation.sessionId))
        .for("update");
      if (
        enrollmentAllocations.some(
          (allocation) => allocation.state !== "checkout_reserved",
        )
      ) {
        throw new Error(
          "Expired checkout contains a non-checkout seat allocation",
        );
      }
      await markUnfundedAllocationsReleased(conn, enrollmentAllocations, now);
      const [expired] = await conn
        .update(academyClassEnrollment)
        .set({ state: "expired", updatedAt: now })
        .where(
          and(
            eq(academyClassEnrollment.id, enrollmentId),
            eq(academyClassEnrollment.state, "checkout_pending"),
          ),
        )
        .returning({ id: academyClassEnrollment.id });
      if (!expired) {
        throw new Error(
          "Checkout changed before its seat reservations expired",
        );
      }
    }
    await conn
      .update(academyClassEnrollmentInstallment)
      .set({ state: "expired", updatedAt: now })
      .where(
        and(
          inArray(academyClassEnrollmentInstallment.enrollmentId, expiredIds),
          inArray(academyClassEnrollmentInstallment.state, [
            "checkout_pending",
            "pending",
          ]),
        ),
      );
    return expiredIds.length;
  }

  async function expireStaleCheckoutForStudentClass(
    conn: DbOrTx,
    studentId: string,
    classId: string,
    now: Date,
  ) {
    const stale = await conn
      .select({ id: academyClassEnrollment.id })
      .from(academyClassEnrollment)
      .where(
        and(
          eq(academyClassEnrollment.studentId, studentId),
          eq(academyClassEnrollment.classId, classId),
          eq(academyClassEnrollment.state, "checkout_pending"),
          lte(academyClassEnrollment.checkoutExpiresAt, now),
        ),
      )
      .orderBy(asc(academyClassEnrollment.id));
    const ids = stale.map((row) => row.id);
    const allocations = await conn
      .select({ sessionId: academyClassEnrollmentAllocation.sessionId })
      .from(academyClassEnrollmentAllocation)
      .where(inArray(academyClassEnrollmentAllocation.enrollmentId, ids));
    await lockSessions(conn, [
      ...new Set(allocations.map((allocation) => allocation.sessionId)),
    ]);
    const locked = await conn
      .select()
      .from(academyClassEnrollment)
      .where(inArray(academyClassEnrollment.id, ids))
      .orderBy(asc(academyClassEnrollment.id))
      .for("update");
    for (const enrollment of locked) {
      if (
        enrollment.state !== "checkout_pending" ||
        !enrollment.checkoutExpiresAt ||
        enrollment.checkoutExpiresAt > now
      ) {
        continue;
      }
      const enrollmentAllocations = await conn
        .select()
        .from(academyClassEnrollmentAllocation)
        .where(eq(academyClassEnrollmentAllocation.enrollmentId, enrollment.id))
        .orderBy(asc(academyClassEnrollmentAllocation.sessionId))
        .for("update");
      if (
        enrollmentAllocations.some(
          (allocation) => allocation.state !== "checkout_reserved",
        )
      ) {
        throw new Error(
          "Expired checkout contains a non-checkout seat allocation",
        );
      }
      await markUnfundedAllocationsReleased(conn, enrollmentAllocations, now);
      const [expired] = await conn
        .update(academyClassEnrollment)
        .set({ state: "expired", updatedAt: now })
        .where(
          and(
            eq(academyClassEnrollment.id, enrollment.id),
            eq(academyClassEnrollment.state, "checkout_pending"),
          ),
        )
        .returning({ id: academyClassEnrollment.id });
      if (!expired) {
        throw new Error(
          "Checkout changed before its seat reservations expired",
        );
      }
      await conn
        .update(academyClassEnrollmentInstallment)
        .set({ state: "expired", updatedAt: now })
        .where(
          and(
            eq(academyClassEnrollmentInstallment.enrollmentId, enrollment.id),
            inArray(academyClassEnrollmentInstallment.state, [
              "checkout_pending",
              "pending",
            ]),
          ),
        );
    }
    return stale.length;
  }

  async function countBlockingSeats(conn: DbOrTx, sessionId: string) {
    const [row] = await conn
      .select({ count: count() })
      .from(academyClassEnrollmentAllocation)
      .where(
        and(
          eq(academyClassEnrollmentAllocation.sessionId, sessionId),
          inArray(academyClassEnrollmentAllocation.state, [
            ...BLOCKING_ALLOCATION_STATES,
          ]),
        ),
      );
    return Number(row?.count ?? 0);
  }

  async function getWalletByUser(conn: DbOrTx, userId: string, lock = false) {
    const query = conn
      .select({
        id: wallet.id,
        availableBalance: wallet.availableBalance,
      })
      .from(wallet)
      .where(eq(wallet.userId, userId))
      .limit(1);
    const [record] = lock ? await query.for("update") : await query;
    return record ?? null;
  }

  async function insertEnrollment(
    conn: DbOrTx,
    values: typeof academyClassEnrollment.$inferInsert,
  ) {
    const [row] = await conn
      .insert(academyClassEnrollment)
      .values(values)
      .returning();
    return row!;
  }

  async function insertInstallments(
    conn: DbOrTx,
    values: (typeof academyClassEnrollmentInstallment.$inferInsert)[],
  ) {
    if (values.length === 0) return [];
    return conn
      .insert(academyClassEnrollmentInstallment)
      .values(values)
      .returning();
  }

  async function insertAllocations(
    conn: DbOrTx,
    values: (typeof academyClassEnrollmentAllocation.$inferInsert)[],
  ) {
    if (values.length === 0) return [];
    return conn
      .insert(academyClassEnrollmentAllocation)
      .values(values)
      .returning();
  }

  async function findInstallments(
    conn: DbOrTx,
    enrollmentId: string,
    lock = false,
  ) {
    const query = conn
      .select()
      .from(academyClassEnrollmentInstallment)
      .where(eq(academyClassEnrollmentInstallment.enrollmentId, enrollmentId))
      .orderBy(asc(academyClassEnrollmentInstallment.ordinal));
    return lock ? await query.for("update") : await query;
  }

  async function findInstallment(
    conn: DbOrTx,
    enrollmentId: string,
    ordinal: 1 | 2,
    lock = false,
  ) {
    const query = conn
      .select()
      .from(academyClassEnrollmentInstallment)
      .where(
        and(
          eq(academyClassEnrollmentInstallment.enrollmentId, enrollmentId),
          eq(academyClassEnrollmentInstallment.ordinal, ordinal),
        ),
      )
      .limit(1);
    const [record] = lock ? await query.for("update") : await query;
    return record ?? null;
  }

  async function findAllocations(
    conn: DbOrTx,
    enrollmentId: string,
    lock = false,
  ) {
    const query = conn
      .select()
      .from(academyClassEnrollmentAllocation)
      .where(eq(academyClassEnrollmentAllocation.enrollmentId, enrollmentId))
      .orderBy(asc(academyClassEnrollmentAllocation.sessionId));
    return lock ? await query.for("update") : await query;
  }

  async function releaseCheckout(
    conn: DbOrTx,
    enrollmentId: string,
    now: Date,
  ) {
    const allocations = await conn
      .select()
      .from(academyClassEnrollmentAllocation)
      .where(eq(academyClassEnrollmentAllocation.enrollmentId, enrollmentId))
      .orderBy(asc(academyClassEnrollmentAllocation.sessionId))
      .for("update");
    if (
      allocations.some((allocation) => allocation.state !== "checkout_reserved")
    ) {
      throw new Error(
        "Expired checkout contains a non-checkout seat allocation",
      );
    }
    await markUnfundedAllocationsReleased(conn, allocations, now);
    const [enrollment] = await conn
      .update(academyClassEnrollment)
      .set({ state: "expired", updatedAt: now })
      .where(
        and(
          eq(academyClassEnrollment.id, enrollmentId),
          eq(academyClassEnrollment.state, "checkout_pending"),
        ),
      )
      .returning({ id: academyClassEnrollment.id });
    if (!enrollment) {
      throw new Error("Checkout changed before its seat reservations expired");
    }
    await conn
      .update(academyClassEnrollmentInstallment)
      .set({ state: "expired", updatedAt: now })
      .where(
        and(
          eq(academyClassEnrollmentInstallment.enrollmentId, enrollmentId),
          inArray(academyClassEnrollmentInstallment.state, [
            "checkout_pending",
            "pending",
          ]),
        ),
      );
  }

  async function markUnfundedAllocationsReleased(
    conn: DbOrTx,
    allocations: readonly (typeof academyClassEnrollmentAllocation.$inferSelect)[],
    now: Date,
  ) {
    for (const allocation of allocations) {
      if (
        allocation.state !== "checkout_reserved" &&
        allocation.state !== "unfunded_reserved"
      ) {
        throw new Error(
          "A funded allocation must be settled before its seat is freed",
        );
      }
      const released = planAllocationRelease(allocation);
      const [updated] = await conn
        .update(academyClassEnrollmentAllocation)
        .set({
          state: released.state,
          fundedMarks: released.fundedMarks,
          spentMarks: released.spentMarks,
          releasedMarks: released.releasedMarks,
          updatedAt: now,
        })
        .where(
          and(
            eq(academyClassEnrollmentAllocation.id, allocation.id),
            eq(academyClassEnrollmentAllocation.state, allocation.state),
          ),
        )
        .returning({ id: academyClassEnrollmentAllocation.id });
      if (!updated) {
        throw new Error("A class allocation changed before its seat was freed");
      }
    }
    return allocations.length;
  }

  async function markUnfundedInstallmentsReserved(
    conn: DbOrTx,
    enrollmentId: string,
    now: Date,
  ) {
    const installments = await findInstallments(conn, enrollmentId);
    const ids = installments
      .filter((item) => item.ordinal === 2 && item.state === "pending")
      .map((item) => item.id);
    if (ids.length === 0) return;
    await conn
      .update(academyClassEnrollmentAllocation)
      .set({ state: "unfunded_reserved", updatedAt: now })
      .where(
        and(
          inArray(academyClassEnrollmentAllocation.installmentId, ids),
          eq(academyClassEnrollmentAllocation.state, "checkout_reserved"),
        ),
      );
  }

  async function markInstallmentFunded(
    conn: DbOrTx,
    installmentId: string,
    expectedAllocationCount: number,
    now: Date,
  ) {
    const [installment] = await conn
      .update(academyClassEnrollmentInstallment)
      .set({ state: "funded", fundedAt: now, updatedAt: now })
      .where(
        and(
          eq(academyClassEnrollmentInstallment.id, installmentId),
          inArray(academyClassEnrollmentInstallment.state, [
            "checkout_pending",
            "pending",
          ]),
        ),
      )
      .returning({ id: academyClassEnrollmentInstallment.id });
    if (!installment) return false;
    const allocations = await conn
      .select()
      .from(academyClassEnrollmentAllocation)
      .where(eq(academyClassEnrollmentAllocation.installmentId, installmentId))
      .orderBy(asc(academyClassEnrollmentAllocation.sessionId))
      .for("update");
    if (allocations.length !== expectedAllocationCount) {
      throw new Error("Funded enrollment allocation count changed");
    }
    for (const allocation of allocations) {
      assertAllocationCanBeFunded(allocation);
    }
    const funded = await conn
      .update(academyClassEnrollmentAllocation)
      .set({
        state: "funded",
        fundedMarks: academyClassEnrollmentAllocation.rateMarks,
        fundedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(academyClassEnrollmentAllocation.installmentId, installmentId),
          inArray(
            academyClassEnrollmentAllocation.id,
            allocations.map((allocation) => allocation.id),
          ),
          inArray(academyClassEnrollmentAllocation.state, [
            "checkout_reserved",
            "unfunded_reserved",
          ]),
        ),
      )
      .returning({ id: academyClassEnrollmentAllocation.id });
    if (funded.length !== expectedAllocationCount) {
      throw new Error("Funded enrollment allocation count changed");
    }
    return true;
  }

  async function activateEnrollmentFromCheckout(
    conn: DbOrTx,
    enrollmentId: string,
    firstInstallmentId: string,
    now: Date,
  ) {
    const [enrollment] = await conn
      .update(academyClassEnrollment)
      .set({ state: "active", checkoutExpiresAt: null, updatedAt: now })
      .where(
        and(
          eq(academyClassEnrollment.id, enrollmentId),
          eq(academyClassEnrollment.state, "checkout_pending"),
        ),
      )
      .returning({ id: academyClassEnrollment.id });
    if (!enrollment) return false;
    await conn
      .update(academyClassEnrollmentInstallment)
      .set({ checkoutExpiresAt: null, updatedAt: now })
      .where(
        and(
          eq(academyClassEnrollmentInstallment.id, firstInstallmentId),
          eq(academyClassEnrollmentInstallment.state, "funded"),
        ),
      );
    return true;
  }

  async function updateInstallmentDueAt(
    conn: DbOrTx,
    installmentId: string,
    dueAt: Date,
    now: Date,
  ) {
    await conn
      .update(academyClassEnrollmentInstallment)
      .set({ dueAt, updatedAt: now })
      .where(eq(academyClassEnrollmentInstallment.id, installmentId));
  }

  async function markInstallmentDefaulted(
    conn: DbOrTx,
    installmentId: string,
    now: Date,
  ) {
    const [defaulted] = await conn
      .update(academyClassEnrollmentInstallment)
      .set({ state: "defaulted", updatedAt: now })
      .where(
        and(
          eq(academyClassEnrollmentInstallment.id, installmentId),
          eq(academyClassEnrollmentInstallment.state, "pending"),
        ),
      )
      .returning({ id: academyClassEnrollmentInstallment.id });
    if (!defaulted) return false;
    const allocations = await conn
      .select()
      .from(academyClassEnrollmentAllocation)
      .where(eq(academyClassEnrollmentAllocation.installmentId, installmentId))
      .orderBy(asc(academyClassEnrollmentAllocation.sessionId))
      .for("update");
    if (
      allocations.length === 0 ||
      allocations.some((allocation) => allocation.state !== "unfunded_reserved")
    ) {
      throw new Error(
        "Unpaid installment must own only unfunded reserved seats",
      );
    }
    await markUnfundedAllocationsReleased(conn, allocations, now);
    return true;
  }

  async function listAvailableSessions(
    conn: DbOrTx,
    classId: string,
    studentId: string,
    now: Date,
  ) {
    const sessions = await conn
      .select({
        sessionId: academyClassSession.id,
        sequenceNumber: academyClassSession.sequenceNumber,
        startAt: academyClassSession.startAt,
        capacity: academyClassSession.capacity,
      })
      .from(academyClassSession)
      .where(
        and(
          eq(academyClassSession.classId, classId),
          eq(academyClassSession.state, "scheduled"),
          gt(academyClassSession.startAt, now),
        ),
      )
      .orderBy(
        asc(academyClassSession.startAt),
        asc(academyClassSession.sequenceNumber),
        asc(academyClassSession.id),
      );
    if (sessions.length === 0) return [];

    const ids = sessions.map((session) => session.sessionId);
    const [counts, owned] = await Promise.all([
      conn
        .select({
          sessionId: academyClassEnrollmentAllocation.sessionId,
          seatsUsed: count(),
        })
        .from(academyClassEnrollmentAllocation)
        .where(
          and(
            inArray(academyClassEnrollmentAllocation.sessionId, ids),
            inArray(academyClassEnrollmentAllocation.state, [
              ...BLOCKING_ALLOCATION_STATES,
            ]),
          ),
        )
        .groupBy(academyClassEnrollmentAllocation.sessionId),
      conn
        .select({ sessionId: academyClassEnrollmentAllocation.sessionId })
        .from(academyClassEnrollmentAllocation)
        .where(
          and(
            eq(academyClassEnrollmentAllocation.studentId, studentId),
            inArray(academyClassEnrollmentAllocation.sessionId, ids),
            inArray(academyClassEnrollmentAllocation.state, [
              ...BLOCKING_ALLOCATION_STATES,
            ]),
          ),
        ),
    ]);
    const countBySession = new Map(
      counts.map((row) => [row.sessionId, Number(row.seatsUsed)]),
    );
    const ownedIds = new Set(owned.map((row) => row.sessionId));
    return sessions.map((session) => ({
      ...session,
      seatsAvailable: Math.max(
        0,
        session.capacity - (countBySession.get(session.sessionId) ?? 0),
      ),
      alreadyEntitled: ownedIds.has(session.sessionId),
    }));
  }

  async function insertTopUpAttempt(
    conn: DbOrTx,
    values: typeof academyClassEnrollmentTopUpAttempt.$inferInsert,
  ) {
    const [row] = await conn
      .insert(academyClassEnrollmentTopUpAttempt)
      .values(values)
      .returning();
    return row!;
  }

  async function findTopUpAttemptByRequestKey(
    conn: DbOrTx,
    installmentId: string,
    requestKey: string,
    lock = false,
  ) {
    const query = conn
      .select()
      .from(academyClassEnrollmentTopUpAttempt)
      .where(
        and(
          eq(academyClassEnrollmentTopUpAttempt.installmentId, installmentId),
          eq(academyClassEnrollmentTopUpAttempt.requestKey, requestKey),
        ),
      )
      .limit(1);
    const [record] = lock ? await query.for("update") : await query;
    return record ?? null;
  }

  async function findTopUpAttemptForStudent(
    conn: DbOrTx,
    studentId: string,
    attemptId: string,
    lock = false,
  ) {
    const query = conn
      .select({
        attempt: academyClassEnrollmentTopUpAttempt,
        enrollment: academyClassEnrollment,
        installment: academyClassEnrollmentInstallment,
      })
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
          eq(academyClassEnrollment.studentId, studentId),
          eq(academyClassEnrollmentTopUpAttempt.id, attemptId),
        ),
      )
      .limit(1);
    const [record] = lock ? await query.for("update") : await query;
    return record ?? null;
  }

  async function updateTopUpAttempt(
    conn: DbOrTx,
    attemptId: string,
    values: Partial<typeof academyClassEnrollmentTopUpAttempt.$inferInsert>,
  ) {
    const [row] = await conn
      .update(academyClassEnrollmentTopUpAttempt)
      .set(values)
      .where(eq(academyClassEnrollmentTopUpAttempt.id, attemptId))
      .returning();
    return row ?? null;
  }

  async function findDueInstallments(conn: DbOrTx, now: Date, limit = 100) {
    return conn
      .select({
        installmentId: academyClassEnrollmentInstallment.id,
        enrollmentId: academyClassEnrollment.id,
        dueSessionId: academyClassEnrollmentInstallment.dueSessionId,
      })
      .from(academyClassEnrollmentInstallment)
      .innerJoin(
        academyClassEnrollment,
        eq(
          academyClassEnrollmentInstallment.enrollmentId,
          academyClassEnrollment.id,
        ),
      )
      .innerJoin(
        academyClassSession,
        eq(
          academyClassEnrollmentInstallment.dueSessionId,
          academyClassSession.id,
        ),
      )
      .where(
        and(
          eq(academyClassEnrollment.state, "active"),
          eq(academyClassEnrollmentInstallment.ordinal, 2),
          eq(academyClassEnrollmentInstallment.state, "pending"),
          lte(academyClassSession.startAt, now),
          eq(academyClassSession.state, "scheduled"),
        ),
      )
      .orderBy(
        asc(academyClassEnrollmentInstallment.dueAt),
        asc(academyClassEnrollmentInstallment.id),
      )
      .limit(limit);
  }

  async function findExpiredCheckouts(conn: DbOrTx, now: Date, limit = 100) {
    return conn
      .select({ id: academyClassEnrollment.id })
      .from(academyClassEnrollment)
      .where(
        and(
          eq(academyClassEnrollment.state, "checkout_pending"),
          lte(academyClassEnrollment.checkoutExpiresAt, now),
        ),
      )
      .orderBy(
        asc(academyClassEnrollment.checkoutExpiresAt),
        asc(academyClassEnrollment.id),
      )
      .limit(limit);
  }

  async function findReminderCandidates(conn: DbOrTx, now: Date, limit = 100) {
    const reminderWindowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return conn
      .select({
        installmentId: academyClassEnrollmentInstallment.id,
        enrollmentId: academyClassEnrollment.id,
      })
      .from(academyClassEnrollmentInstallment)
      .innerJoin(
        academyClassEnrollment,
        eq(
          academyClassEnrollmentInstallment.enrollmentId,
          academyClassEnrollment.id,
        ),
      )
      .innerJoin(
        academyClassSession,
        eq(
          academyClassEnrollmentInstallment.dueSessionId,
          academyClassSession.id,
        ),
      )
      .where(
        and(
          eq(academyClassEnrollment.state, "active"),
          eq(academyClassEnrollmentInstallment.ordinal, 2),
          eq(academyClassEnrollmentInstallment.state, "pending"),
          gt(academyClassSession.startAt, now),
          lte(academyClassSession.startAt, reminderWindowEnd),
          eq(academyClassSession.state, "scheduled"),
          or(
            isNull(academyClassEnrollmentInstallment.reminder7dProcessedAt),
            sql`${academyClassEnrollmentInstallment.reminder7dForAt} IS DISTINCT FROM ${academyClassSession.startAt}`,
            isNull(academyClassEnrollmentInstallment.reminder1dProcessedAt),
            sql`${academyClassEnrollmentInstallment.reminder1dForAt} IS DISTINCT FROM ${academyClassSession.startAt}`,
          ),
        ),
      )
      .orderBy(
        asc(academyClassSession.startAt),
        asc(academyClassEnrollmentInstallment.id),
      )
      .limit(limit);
  }

  async function markReminderProcessed(
    conn: DbOrTx,
    installmentId: string,
    reminder: "7d" | "1d",
    dueAt: Date,
    now: Date,
  ) {
    const marker =
      reminder === "7d"
        ? academyClassEnrollmentInstallment.reminder7dProcessedAt
        : academyClassEnrollmentInstallment.reminder1dProcessedAt;
    const processedFor =
      reminder === "7d"
        ? academyClassEnrollmentInstallment.reminder7dForAt
        : academyClassEnrollmentInstallment.reminder1dForAt;
    const condition = and(
      eq(academyClassEnrollmentInstallment.id, installmentId),
      or(isNull(marker), isNull(processedFor), ne(processedFor, dueAt)),
      eq(academyClassEnrollmentInstallment.state, "pending"),
    );
    if (reminder === "7d") {
      await conn
        .update(academyClassEnrollmentInstallment)
        .set({
          reminder7dProcessedAt: now,
          reminder7dForAt: dueAt,
          updatedAt: now,
        })
        .where(condition);
    } else {
      await conn
        .update(academyClassEnrollmentInstallment)
        .set({
          reminder1dProcessedAt: now,
          reminder1dForAt: dueAt,
          updatedAt: now,
        })
        .where(condition);
    }
  }

  return {
    getClassForEnrollment,
    listClassSessions,
    lockSessions,
    getSessionDueInfo,
    findEnrollmentByRequestKey,
    lockEnrollmentRequestKey,
    findEnrollment,
    findEnrollmentById,
    findStudentClassEnrollments,
    findStudentClassRecords,
    findBlockingAllocationForSessions,
    expireStaleCheckoutsForSessions,
    expireStaleCheckoutForStudentClass,
    countBlockingSeats,
    getWalletByUser,
    insertEnrollment,
    insertInstallments,
    insertAllocations,
    findInstallments,
    findInstallment,
    findAllocations,
    releaseCheckout,
    markUnfundedInstallmentsReserved,
    markInstallmentFunded,
    activateEnrollmentFromCheckout,
    markInstallmentDefaulted,
    updateInstallmentDueAt,
    listAvailableSessions,
    insertTopUpAttempt,
    findTopUpAttemptByRequestKey,
    findTopUpAttemptForStudent,
    updateTopUpAttempt,
    findDueInstallments,
    findExpiredCheckouts,
    findReminderCandidates,
    markReminderProcessed,
  };
}

export type ClassEnrollmentRepo = ReturnType<typeof createClassEnrollmentRepo>;
export type ClassEnrollmentDb = DbType;
