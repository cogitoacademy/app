import { afterAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  auditLog,
  academyClassMeeting,
  academyClass,
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassSession,
  academyClassSessionReport,
  academyClassSessionReportRevision,
  ledgerEntry,
  subjectCategory,
  tutorInvite,
  tutorPayout,
  tutorPayoutAllocation,
  tutorProfile,
  tutorSessionFee,
  user,
  wallet as walletTable,
} from "@cogito-app/db/schema";
import { createTestClient } from "../helpers/test-client";
import { services } from "../../services";
import { createAcademyClassService } from "../../modules/academy-class/academy-class.service";
import type { MeetingPort } from "../../modules/meeting/meeting.types";
import { createClassEnrollmentService } from "../../modules/class-enrollment/class-enrollment.service";

function assertDedicatedEnrollmentTestDatabase() {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error(
      "Class enrollment integration tests require loopback:6769/cogito-test.",
    );
  }
  const host = url.hostname.toLowerCase();
  if (
    process.env.NODE_ENV !== "test" ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) ||
    url.port !== "6769" ||
    url.pathname !== "/cogito-test"
  ) {
    throw new Error(
      "Class enrollment integration tests require NODE_ENV=test and loopback:6769/cogito-test; no data was changed.",
    );
  }
}

assertDedicatedEnrollmentTestDatabase();

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TIME = new Date("2040-01-01T00:00:00.000Z");
const ownedClassIds = new Set<string>();
const ownedPayoutIds = new Set<string>();
const ownedUserIds = new Set<string>();

type Fixture = {
  classId: string;
  studentIds: string[];
  tutorId: string;
  walletIds: string[];
  sessionIds: string[];
  startAt: Date[];
  getNow: () => Date;
  setNow: (value: Date) => void;
  notifications: Array<Record<string, unknown>>;
  service: ReturnType<typeof createClassEnrollmentService>;
};

function makeService(
  now: () => Date,
  notifications: Array<Record<string, unknown>>,
  walletPort: typeof services.wallet = services.wallet,
) {
  return createClassEnrollmentService({
    db,
    wallet: walletPort,
    payment: {
      createTopUpQuote: async () => {
        throw new Error("Provider-backed top-up is outside this DB fixture");
      },
      createPurchaseFromTopUpQuote: async () => {
        throw new Error("Provider-backed top-up is outside this DB fixture");
      },
    } as never,
    notification: {
      write: async (input: Record<string, unknown>) => {
        notifications.push(input);
      },
    } as never,
    appBaseUrl: "http://localhost:3200",
    clock: now,
  });
}

async function createFixture(options: {
  sessions: number;
  capacity?: number;
  studentCount?: number;
  balance?: number;
  startsInDays?: number[];
  walletPort?: typeof services.wallet;
}): Promise<Fixture> {
  const now = { value: new Date(BASE_TIME) };
  const getNow = () => new Date(now.value);
  const setNow = (value: Date) => {
    now.value = new Date(value);
  };
  const suffix = crypto.randomUUID();
  const students: string[] = [];
  const walletIds: string[] = [];
  const sessionIds: string[] = [];
  const startAt: Date[] = [];
  const notifications: Array<Record<string, unknown>> = [];

  for (let index = 0; index < (options.studentCount ?? 1); index += 1) {
    const id = crypto.randomUUID();
    const [created] = await db
      .insert(user)
      .values({
        id,
        name: `Enrollment test student ${index}`,
        email: `enrollment-${suffix}-${index}@example.test`,
        emailVerified: true,
        role: "student",
      })
      .returning({ id: user.id });
    if (!created) throw new Error("Student fixture was not created");
    students.push(created.id);
    ownedUserIds.add(created.id);

    const [wallet] = await db
      .insert(walletTable)
      .values({
        userId: created.id,
        totalBalance: options.balance ?? 0,
        heldBalance: 0,
        availableBalance: options.balance ?? 0,
      })
      .returning({ id: walletTable.id });
    if (!wallet) throw new Error("Wallet fixture was not created");
    walletIds.push(wallet.id);
  }

  const tutorId = crypto.randomUUID();
  await db.insert(user).values({
    id: tutorId,
    name: "Enrollment test tutor",
    email: `enrollment-tutor-${suffix}@example.test`,
    emailVerified: true,
    role: "tutor",
  });
  ownedUserIds.add(tutorId);

  const competition = await db.query.subjectCategory.findFirst({
    columns: { id: true },
    where: and(
      eq(subjectCategory.isActive, true),
      isNull(subjectCategory.parentId),
    ),
  });
  if (!competition) {
    throw new Error("The dedicated test database needs one active competition");
  }

  const classId = crypto.randomUUID();
  await db.insert(academyClass).values({
    id: classId,
    kind: "cohort",
    competitionId: competition.id,
    titleEn: `Enrollment DB fixture ${suffix}`,
    descriptionEn: "Synthetic class for isolated enrollment integration tests.",
    tutorFeeIdr: 400_000,
    state: "published",
    minimumEnrollment: 1,
    minimumCheckAt: new Date(BASE_TIME.getTime() - DAY_MS),
    cohortFullRateMarks: 20,
    cohortHalfRateMarks: 22,
    cohortSingleRateMarks: 25,
    masterclassRateMarks: null,
    publishedAt: BASE_TIME,
  });
  ownedClassIds.add(classId);

  for (let index = 0; index < options.sessions; index += 1) {
    const days = options.startsInDays?.[index] ?? 100 + index;
    const id = crypto.randomUUID();
    const start = new Date(BASE_TIME.getTime() + days * DAY_MS);
    startAt.push(start);
    sessionIds.push(id);
    await db.insert(academyClassSession).values({
      id,
      classId,
      sequenceNumber: index + 1,
      capacity: options.capacity ?? 4,
      titleEn: `Session ${index + 1}`,
      startAt: start,
      endAt: new Date(start.getTime() + 60 * 60 * 1000),
      mode: "online",
      roomId: null,
      tutorId,
      tutorFeeIdr: 400_000,
      state: "scheduled",
    });
  }

  return {
    classId,
    studentIds: students,
    tutorId,
    walletIds,
    sessionIds,
    startAt,
    getNow,
    setNow,
    notifications,
    service: makeService(getNow, notifications, options.walletPort),
  };
}

async function enrollmentRows(fixture: Fixture) {
  return db
    .select()
    .from(academyClassEnrollment)
    .where(eq(academyClassEnrollment.classId, fixture.classId));
}

async function allocationRows(fixture: Fixture) {
  return db
    .select()
    .from(academyClassEnrollmentAllocation)
    .where(eq(academyClassEnrollmentAllocation.classId, fixture.classId));
}

async function ledgerHolds(fixture: Fixture) {
  return db
    .select()
    .from(ledgerEntry)
    .where(
      and(
        inArray(ledgerEntry.walletId, fixture.walletIds),
        eq(ledgerEntry.entryType, "hold"),
      ),
    );
}

async function makeEnrollment(
  fixture: Fixture,
  studentIndex: number,
  plan: "full" | "half" | "single",
  requestKey = crypto.randomUUID(),
  sessionId?: string,
) {
  return fixture.service.createEnrollment(fixture.studentIds[studentIndex]!, {
    classId: fixture.classId,
    plan,
    requestKey,
    ...(sessionId ? { sessionId } : {}),
  });
}

const CLASS_REPORT_FEEDBACK = {
  discussion: ["Reviewed the session topic and practice questions."],
  strengths: ["Explained the key steps clearly."],
  improvements: ["Show each intermediate calculation next time."],
};

function makeClassReportInput(
  fixture: Fixture,
  overrides: Partial<{
    expectedVersion: number;
    requestKey: string;
    feedback: typeof CLASS_REPORT_FEEDBACK;
    adminReason: string;
  }> = {},
) {
  return {
    classId: fixture.classId,
    sessionId: fixture.sessionIds[0]!,
    expectedVersion: 0,
    requestKey: crypto.randomUUID(),
    deliveryConfirmed: true as const,
    feedback: CLASS_REPORT_FEEDBACK,
    ...overrides,
  };
}

async function createReportAdmin() {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    name: "Class report admin",
    email: `class-report-admin-${id}@example.test`,
    emailVerified: true,
    role: "admin",
  });
  ownedUserIds.add(id);
  return id;
}

afterAll(async () => {
  const classIds = [...ownedClassIds];
  const userIds = [...ownedUserIds];
  if (classIds.length > 0) {
    const sessions = await db
      .select({ id: academyClassSession.id })
      .from(academyClassSession)
      .where(inArray(academyClassSession.classId, classIds));
    const sessionIds = sessions.map((row) => row.id);
    if (sessionIds.length > 0) {
      const reports = await db
        .select({ id: academyClassSessionReport.id })
        .from(academyClassSessionReport)
        .where(inArray(academyClassSessionReport.sessionId, sessionIds));
      const reportIds = reports.map((row) => row.id);
      if (reportIds.length > 0) {
        await db
          .delete(auditLog)
          .where(
            and(
              inArray(auditLog.targetId, reportIds),
              inArray(auditLog.action, [
                "academy_class_session.report_submitted",
                "academy_class_session.report_updated",
              ]),
            ),
          );
        await db
          .delete(academyClassSessionReportRevision)
          .where(
            inArray(academyClassSessionReportRevision.reportId, reportIds),
          );
      }
      const payoutIds = [...ownedPayoutIds];
      if (payoutIds.length > 0) {
        await db
          .delete(tutorPayoutAllocation)
          .where(inArray(tutorPayoutAllocation.payoutId, payoutIds));
        await db
          .delete(auditLog)
          .where(
            and(
              eq(auditLog.action, "tutor_payout_prepared"),
              inArray(auditLog.targetId, payoutIds),
            ),
          );
        await db.delete(tutorPayout).where(inArray(tutorPayout.id, payoutIds));
      }
      await db
        .delete(tutorSessionFee)
        .where(inArray(tutorSessionFee.academyClassSessionId, sessionIds));
      await db
        .delete(academyClassSessionReport)
        .where(inArray(academyClassSessionReport.sessionId, sessionIds));
      await db
        .delete(auditLog)
        .where(
          and(
            inArray(auditLog.action, [
              "academy_class.session_cancelled",
              "academy_class.minimum_continued",
              "academy_class.minimum_postponed",
            ]),
            inArray(auditLog.targetId, [...classIds, ...sessionIds]),
          ),
        );
    }
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.action, "academy_class.cancelled"),
          inArray(auditLog.targetId, classIds),
        ),
      );
    const enrollments = await db
      .select({ id: academyClassEnrollment.id })
      .from(academyClassEnrollment)
      .where(inArray(academyClassEnrollment.classId, classIds));
    if (enrollments.length)
      await db.delete(auditLog).where(
        and(
          eq(auditLog.action, "class_enrollment_cancelled"),
          inArray(
            auditLog.targetId,
            enrollments.map((row) => row.id),
          ),
        ),
      );
    await db
      .delete(academyClassEnrollment)
      .where(inArray(academyClassEnrollment.classId, classIds));
    await db.delete(academyClass).where(inArray(academyClass.id, classIds));
  }
  if (userIds.length > 0) {
    await db.delete(walletTable).where(inArray(walletTable.userId, userIds));
    await db.delete(user).where(inArray(user.id, userIds));
  }
});

describe("class enrollment PostgreSQL invariants [REQ-ENROLL-01..04]", () => {
  test("checkout rechecks the deadline after database waits before holding Marks", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 0 });
    const enrollment = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    await db
      .update(walletTable)
      .set({ totalBalance: 25, availableBalance: 25 })
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    const pending = fixture.service.completeCheckout(
      fixture.studentIds[0]!,
      enrollment.id,
    );
    fixture.setNow(new Date(BASE_TIME.getTime() + 16 * 60_000));
    expect(await pending).toMatchObject({ outcome: "expired" });
    expect(await ledgerHolds(fixture)).toHaveLength(0);
    expect((await allocationRows(fixture))[0]?.state).toBe("released");
  });

  test("checkout cannot fund a reserved session after it starts", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 0 });
    const enrollment = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    await db
      .update(walletTable)
      .set({ totalBalance: 25, availableBalance: 25 })
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    await db
      .update(academyClassSession)
      .set({ startAt: new Date(BASE_TIME.getTime() + 60_000) })
      .where(eq(academyClassSession.id, fixture.sessionIds[0]!));
    fixture.setNow(new Date(BASE_TIME.getTime() + 2 * 60_000));
    await expect(
      fixture.service.completeCheckout(fixture.studentIds[0]!, enrollment.id),
    ).rejects.toThrow("no longer scheduled in the future");
    expect(await ledgerHolds(fixture)).toHaveLength(0);
  });

  test("same request retries create one hold, and a last-seat race has one winner", async () => {
    const duplicate = await createFixture({ sessions: 1, balance: 25 });
    const requestKey = crypto.randomUUID();
    const [first, retry] = await Promise.all([
      makeEnrollment(
        duplicate,
        0,
        "single",
        requestKey,
        duplicate.sessionIds[0],
      ),
      makeEnrollment(
        duplicate,
        0,
        "single",
        requestKey,
        duplicate.sessionIds[0],
      ),
    ]);
    expect(new Set([first.id, retry.id]).size).toBe(1);
    expect([first.outcome, retry.outcome].sort()).toEqual([
      "already_exists",
      "confirmed",
    ]);
    expect(await enrollmentRows(duplicate)).toHaveLength(1);
    expect(await ledgerHolds(duplicate)).toHaveLength(1);
    const [allocation] = await allocationRows(duplicate);
    expect(allocation).toMatchObject({
      state: "funded",
      fundingEventKey: `class-enrollment:${first.id}:session:${duplicate.sessionIds[0]}:hold:v1`,
      fundingSourceReference: `academy-class-enrollment/${first.id}/allocation/${allocation?.id}`,
    });

    const race = await createFixture({
      sessions: 1,
      capacity: 1,
      studentCount: 2,
      balance: 25,
    });
    const outcomes = await Promise.allSettled([
      makeEnrollment(
        race,
        0,
        "single",
        crypto.randomUUID(),
        race.sessionIds[0],
      ),
      makeEnrollment(
        race,
        1,
        "single",
        crypto.randomUUID(),
        race.sessionIds[0],
      ),
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    expect(await allocationRows(race)).toHaveLength(1);
    expect((await allocationRows(race))[0]?.state).toBe("funded");
    expect(await ledgerHolds(race)).toHaveLength(1);
  });

  test("funding failure rolls back every seat, allocation, wallet hold, and ledger row", async () => {
    let calls = 0;
    const walletPort = {
      ...services.wallet,
      hold: async (
        tx: Parameters<typeof services.wallet.hold>[0],
        input: Parameters<typeof services.wallet.hold>[1],
      ) => {
        calls += 1;
        if (calls === 2)
          throw new Error("injected second allocation hold failure");
        return services.wallet.hold(tx, input);
      },
    } as typeof services.wallet;
    const fixture = await createFixture({
      sessions: 2,
      capacity: 1,
      balance: 40,
      walletPort,
    });

    await expect(makeEnrollment(fixture, 0, "full")).rejects.toThrow(
      "injected second allocation hold failure",
    );
    expect(await enrollmentRows(fixture)).toHaveLength(0);
    expect(await allocationRows(fixture)).toHaveLength(0);
    expect(await ledgerHolds(fixture)).toHaveLength(0);
    const [wallet] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(wallet).toMatchObject({
      totalBalance: 40,
      heldBalance: 0,
      availableBalance: 40,
    });
  });

  test("full/half/single snapshots survive rate edits and repeated installment pay", async () => {
    const full = await createFixture({ sessions: 16, balance: 500 });
    const createdFull = await makeEnrollment(full, 0, "full");
    expect(createdFull.firstInstallmentMarks).toBe(320);
    expect(createdFull.state).toBe("active");

    const half = await createFixture({ sessions: 16, balance: 500 });
    const createdHalf = await makeEnrollment(half, 0, "half");
    expect(createdHalf.firstInstallmentMarks).toBe(176);
    expect(createdHalf.secondInstallmentMarks).toBe(176);
    const beforeSecondPay = await allocationRows(half);
    expect(
      beforeSecondPay.filter((row) => row.state === "funded"),
    ).toHaveLength(8);
    expect(
      beforeSecondPay.filter((row) => row.state === "unfunded_reserved"),
    ).toHaveLength(8);
    await expect(
      makeEnrollment(
        half,
        0,
        "single",
        crypto.randomUUID(),
        half.sessionIds[0],
      ),
    ).rejects.toThrow();
    await db
      .update(academyClass)
      .set({ cohortHalfRateMarks: 30 })
      .where(eq(academyClass.id, half.classId));

    const studentId = half.studentIds[0]!;
    const [firstPay, retryPay] = await Promise.all([
      half.service.paySecondInstallment(studentId, createdHalf.id),
      half.service.paySecondInstallment(studentId, createdHalf.id),
    ]);
    expect(firstPay.outcome).toBe("funded");
    expect(retryPay.outcome).toBe("funded");
    const halfAllocations = await allocationRows(half);
    expect(halfAllocations).toHaveLength(16);
    expect(halfAllocations.every((row) => row.rateMarks === 22)).toBe(true);
    expect(halfAllocations.every((row) => row.fundedMarks === 22)).toBe(true);
    expect(await ledgerHolds(half)).toHaveLength(16);

    const single = await createFixture({ sessions: 1, balance: 25 });
    const createdSingle = await makeEnrollment(
      single,
      0,
      "single",
      crypto.randomUUID(),
      single.sessionIds[0],
    );
    expect(createdSingle.firstInstallmentMarks).toBe(25);
    expect((await allocationRows(single))[0]).toMatchObject({
      rateMarks: 25,
      fundedMarks: 25,
      state: "funded",
    });
  });

  test("insufficient Marks expires to zero-residual released seats and allows a fresh quote", async () => {
    const fixture = await createFixture({
      sessions: 2,
      capacity: 1,
      balance: 0,
    });
    const pending = await makeEnrollment(fixture, 0, "full");
    expect(pending.outcome).toBe("checkout_pending");
    expect(pending.shortfallMarks).toBe(40);
    expect(await ledgerHolds(fixture)).toHaveLength(0);
    expect(
      (await allocationRows(fixture)).every((row) => row.fundedMarks === 0),
    ).toBe(true);

    fixture.setNow(new Date(BASE_TIME.getTime() + 16 * 60 * 1000));
    const dueJobs = await fixture.service.processDueJobs();
    expect(dueJobs.expiredCheckouts).toBeGreaterThanOrEqual(1);
    expect((await enrollmentRows(fixture))[0]?.state).toBe("expired");
    const released = await allocationRows(fixture);
    expect(released).toHaveLength(2);
    expect(released.every((row) => row.state === "released")).toBe(true);
    expect(
      released.every(
        (row) => row.spentMarks + row.releasedMarks === row.fundedMarks,
      ),
    ).toBe(true);
    const refreshed = await fixture.service.getMyClassEnrollments(
      fixture.studentIds[0]!,
      fixture.classId,
    );
    expect(
      refreshed.eligibleSessions.every(
        (session) => session.seatsAvailable === 1,
      ),
    ).toBe(true);
    const rejoin = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[1],
    );
    expect(rejoin.state).toBe("checkout_pending");
    expect(await enrollmentRows(fixture)).toHaveLength(2);
  });

  test("a missed second installment frees only its unpaid half and permits a current future-only quote", async () => {
    const fixture = await createFixture({
      sessions: 4,
      balance: 500,
      startsInDays: [1, 2, 3, 4],
    });
    const enrollment = await makeEnrollment(fixture, 0, "half");
    const [secondInstallment] = await db
      .select()
      .from(academyClassEnrollmentInstallment)
      .where(
        and(
          eq(academyClassEnrollmentInstallment.enrollmentId, enrollment.id),
          eq(academyClassEnrollmentInstallment.ordinal, 2),
        ),
      );
    expect(secondInstallment?.dueAt).toEqual(fixture.startAt[2]);

    fixture.setNow(fixture.startAt[2]!);
    const [defaulted, replay] = await Promise.all([
      fixture.service.paySecondInstallment(
        fixture.studentIds[0]!,
        enrollment.id,
      ),
      fixture.service.paySecondInstallment(
        fixture.studentIds[0]!,
        enrollment.id,
      ),
    ]);
    expect(defaulted.outcome).toBe("defaulted");
    expect(replay.outcome).toBe("defaulted");
    const allocations = await allocationRows(fixture);
    const unpaid = allocations.filter((row) => row.ordinal > 2);
    expect(unpaid).toHaveLength(2);
    expect(unpaid.every((row) => row.state === "released")).toBe(true);
    expect(
      unpaid.every(
        (row) =>
          row.fundedMarks === 0 &&
          row.spentMarks === 0 &&
          row.releasedMarks === 0,
      ),
    ).toBe(true);
    expect(await ledgerHolds(fixture)).toHaveLength(2);

    await db
      .update(academyClass)
      .set({ cohortHalfRateMarks: 30 })
      .where(eq(academyClass.id, fixture.classId));
    const rejoin = await makeEnrollment(fixture, 0, "half");
    expect(rejoin.sessionCount).toBe(1);
    expect(rejoin.firstInstallmentMarks).toBe(30);
    expect(rejoin.secondInstallmentMarks).toBe(0);
    expect(
      rejoin.allocations.map((allocation) => allocation.sessionId),
    ).toEqual([fixture.sessionIds[3]]);
  });

  test("missed reminders catch up once, while a late join never gets historical notices", async () => {
    const missedJob = await createFixture({ sessions: 2, balance: 500 });
    await makeEnrollment(missedJob, 0, "half");
    missedJob.setNow(
      new Date(missedJob.startAt[1]!.getTime() - 12 * 60 * 60 * 1000),
    );
    expect(await missedJob.service.processDueJobs()).toMatchObject({
      remindersQueued: 2,
    });
    expect(await missedJob.service.processDueJobs()).toMatchObject({
      remindersQueued: 0,
    });
    expect(missedJob.notifications.map((event) => event.eventKey)).toHaveLength(
      2,
    );

    const lateJoin = await createFixture({
      sessions: 2,
      balance: 500,
      startsInDays: [1, 6],
    });
    await makeEnrollment(lateJoin, 0, "half");
    lateJoin.setNow(
      new Date(lateJoin.startAt[1]!.getTime() - 12 * 60 * 60 * 1000),
    );
    expect(await lateJoin.service.processDueJobs()).toMatchObject({
      remindersQueued: 1,
    });
    expect(lateJoin.notifications).toHaveLength(1);
    expect(lateJoin.notifications[0]?.eventKey).toContain(":1d:");
  });

  test("anonymous, tutor, and another student cannot read or pay an enrollment", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 0 });
    const pending = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    const otherId = crypto.randomUUID();
    await db.insert(user).values({
      id: otherId,
      name: "Unrelated enrollment student",
      email: `enrollment-other-${crypto.randomUUID()}@example.test`,
      emailVerified: true,
      role: "student",
    });
    ownedUserIds.add(otherId);

    const baseContext = {
      services,
      headers: new Headers(),
    };
    const anonymous = createTestClient({
      ...baseContext,
      session: null,
    } as never);
    const tutor = createTestClient({
      ...baseContext,
      session: {
        user: {
          id: fixture.tutorId,
          name: "Enrollment test tutor",
          email: "enrollment-auth-tutor@example.test",
          role: "tutor",
          emailVerified: true,
        },
      },
    } as never);
    const otherStudent = createTestClient({
      ...baseContext,
      session: {
        user: {
          id: otherId,
          name: "Unrelated enrollment student",
          email: "enrollment-auth-student@example.test",
          role: "student",
          emailVerified: true,
        },
      },
    } as never);

    await expect(
      anonymous.classes.getMyEnrollments({ classId: fixture.classId }),
    ).rejects.toThrow();
    await expect(
      tutor.classes.createEnrollment({
        classId: fixture.classId,
        plan: "single",
        requestKey: crypto.randomUUID(),
        sessionId: fixture.sessionIds[0],
      }),
    ).rejects.toThrow();
    await expect(
      otherStudent.classes.completeCheckout({ enrollmentId: pending.id }),
    ).rejects.toThrow();
    await expect(
      anonymous.classes.quoteCancellation({ enrollmentId: pending.id }),
    ).rejects.toThrow();
    await expect(
      tutor.classes.quoteCancellation({ enrollmentId: pending.id }),
    ).rejects.toThrow();
    await expect(
      otherStudent.classes.quoteCancellation({ enrollmentId: pending.id }),
    ).rejects.toThrow();
    expect(await ledgerHolds(fixture)).toHaveLength(0);
    await expect(
      otherStudent.classes.previewAdminCancellation({
        classId: fixture.classId,
        expectedVersion: 1,
        reason: "Unauthorized cancellation",
      }),
    ).rejects.toThrow();
    await expect(
      tutor.classes.previewAdminCancellation({
        classId: fixture.classId,
        expectedVersion: 1,
        reason: "Unauthorized cancellation",
      }),
    ).rejects.toThrow();
    expect(await enrollmentRows(fixture)).toHaveLength(1);
  });
  test("cancellation quotes an exact return and concurrent confirmation settles once", async () => {
    const fixture = await createFixture({ sessions: 2, balance: 100 });
    const enrollment = await makeEnrollment(fixture, 0, "full");
    const studentId = fixture.studentIds[0]!;
    const input = {
      enrollmentId: enrollment.id,
      sessionId: fixture.sessionIds[0]!,
    };
    const quote = await fixture.service.quoteCancellation(studentId, input);
    expect(quote).toMatchObject({ feeMarks: 4, returnMarks: 16 });
    const confirm = {
      ...input,
      quoteVersion: quote.quoteVersion,
      requestKey: crypto.randomUUID(),
    };
    const results = await Promise.all([
      fixture.service.confirmCancellation(studentId, confirm),
      fixture.service.confirmCancellation(studentId, confirm),
    ]);
    expect(results[0]?.quoteVersion).toBe(results[1]?.quoteVersion);
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance).toMatchObject({
      totalBalance: 96,
      heldBalance: 20,
      availableBalance: 76,
    });
    const rows = await allocationRows(fixture);
    expect(
      rows.find((row) => row.sessionId === fixture.sessionIds[0]),
    ).toMatchObject({ state: "released", spentMarks: 4, releasedMarks: 16 });
    expect(
      rows.find((row) => row.sessionId === fixture.sessionIds[1]),
    ).toMatchObject({ state: "funded", spentMarks: 0, releasedMarks: 0 });
    const receipts = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, enrollment.id),
          eq(auditLog.action, "class_enrollment_cancelled"),
        ),
      );
    expect(receipts).toHaveLength(1);
    expect(fixture.notifications).toHaveLength(1);
    await expect(
      fixture.service.confirmCancellation(studentId, {
        ...confirm,
        sessionId: fixture.sessionIds[1]!,
      }),
    ).rejects.toThrow("already used");
  });

  test("withdrawal stops the unpaid half, returns only funded remainder and cannot pay again", async () => {
    const fixture = await createFixture({ sessions: 4, balance: 100 });
    const enrollment = await makeEnrollment(fixture, 0, "half");
    const studentId = fixture.studentIds[0]!;
    const input = { enrollmentId: enrollment.id };
    const quote = await fixture.service.quoteCancellation(studentId, input);
    expect(quote).toMatchObject({ feeMarks: 9, returnMarks: 35 });
    expect(quote.unpaidAllocationIds).toHaveLength(2);
    const confirmation = {
      ...input,
      requestKey: crypto.randomUUID(),
      quoteVersion: quote.quoteVersion,
    };
    await fixture.service.confirmCancellation(studentId, confirmation);
    expect(
      (await allocationRows(fixture)).every((row) => row.state === "released"),
    ).toBe(true);
    expect(
      (await fixture.service.paySecondInstallment(studentId, enrollment.id))
        .outcome,
    ).toBe("expired");
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance).toMatchObject({
      totalBalance: 91,
      heldBalance: 0,
      availableBalance: 91,
    });
    expect(
      (await fixture.service.confirmCancellation(studentId, confirmation))
        .returnMarks,
    ).toBe(35);
  });

  test("a cancellation quote crossing the inclusive 24h boundary is rejected without financial writes", async () => {
    const fixture = await createFixture({
      sessions: 1,
      balance: 100,
      startsInDays: [1],
    });
    const enrollment = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    const input = {
      enrollmentId: enrollment.id,
      sessionId: fixture.sessionIds[0]!,
    };
    const quote = await fixture.service.quoteCancellation(
      fixture.studentIds[0]!,
      input,
    );
    expect(quote.returnMarks).toBe(20);
    fixture.setNow(new Date(BASE_TIME.getTime() + 1));
    await expect(
      fixture.service.confirmCancellation(fixture.studentIds[0]!, {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: quote.quoteVersion,
      }),
    ).rejects.toThrow();
    expect((await allocationRows(fixture))[0]).toMatchObject({
      state: "funded",
      spentMarks: 0,
      releasedMarks: 0,
    });
  });

  test("withdrawal versus second payment serializes without residual held Marks", async () => {
    const fixture = await createFixture({ sessions: 2, balance: 100 });
    const enrollment = await makeEnrollment(fixture, 0, "half");
    const studentId = fixture.studentIds[0]!;
    const input = { enrollmentId: enrollment.id };
    const quote = await fixture.service.quoteCancellation(studentId, input);
    const [withdrawal] = await Promise.allSettled([
      fixture.service.confirmCancellation(studentId, {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: quote.quoteVersion,
      }),
      fixture.service.paySecondInstallment(studentId, enrollment.id),
    ]);
    if (withdrawal.status === "rejected") {
      const fresh = await fixture.service.quoteCancellation(studentId, input);
      await fixture.service.confirmCancellation(studentId, {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: fresh.quoteVersion,
      });
    }
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance!.heldBalance).toBe(0);
    expect(balance!.availableBalance).toBe(balance!.totalBalance);
    expect(
      (await allocationRows(fixture)).every((row) => row.state === "released"),
    ).toBe(true);
  });
  test("failed wallet return rolls back the preceding fee, receipt and allocation release", async () => {
    const fixture = await createFixture({
      sessions: 1,
      balance: 100,
      walletPort: {
        ...services.wallet,
        release: async () => {
          throw new Error("Injected cancellation release failure");
        },
      },
    });
    const enrollment = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    const input = {
      enrollmentId: enrollment.id,
      sessionId: fixture.sessionIds[0]!,
    };
    const quote = await fixture.service.quoteCancellation(
      fixture.studentIds[0]!,
      input,
    );
    await expect(
      fixture.service.confirmCancellation(fixture.studentIds[0]!, {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: quote.quoteVersion,
      }),
    ).rejects.toThrow("Injected cancellation");
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance).toMatchObject({
      totalBalance: 100,
      heldBalance: 25,
      availableBalance: 75,
    });
    expect((await allocationRows(fixture))[0]).toMatchObject({
      state: "funded",
      spentMarks: 0,
      releasedMarks: 0,
    });
    const receipts = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, enrollment.id),
          eq(auditLog.action, "class_enrollment_cancelled"),
        ),
      );
    expect(receipts).toHaveLength(0);
    expect(fixture.notifications).toHaveLength(0);
  });

  test("withdrawal retains late funded delivery liability and releases only early seats", async () => {
    const fixture = await createFixture({
      sessions: 2,
      balance: 100,
      startsInDays: [0.5, 2],
    });
    const enrollment = await makeEnrollment(fixture, 0, "full");
    const input = { enrollmentId: enrollment.id };
    const quote = await fixture.service.quoteCancellation(
      fixture.studentIds[0]!,
      input,
    );
    expect(quote).toMatchObject({
      feeMarks: 4,
      returnMarks: 16,
      retainedMarks: 20,
    });
    await fixture.service.confirmCancellation(fixture.studentIds[0]!, {
      ...input,
      requestKey: crypto.randomUUID(),
      quoteVersion: quote.quoteVersion,
    });
    const rows = await allocationRows(fixture);
    expect(
      rows.find((row) => row.sessionId === fixture.sessionIds[0]),
    ).toMatchObject({ state: "funded", spentMarks: 0, releasedMarks: 0 });
    expect(
      rows.find((row) => row.sessionId === fixture.sessionIds[1]),
    ).toMatchObject({ state: "released", spentMarks: 4, releasedMarks: 16 });
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance).toMatchObject({
      totalBalance: 96,
      heldBalance: 20,
      availableBalance: 76,
    });
  });
  test("admin cancellation returns all future holds once, expires checkouts and preserves snapshots", async () => {
    const fixture = await createFixture({
      sessions: 4,
      balance: 100,
      studentCount: 3,
    });
    const full = await makeEnrollment(fixture, 0, "full");
    await makeEnrollment(fixture, 1, "half");
    await db
      .update(walletTable)
      .set({ totalBalance: 0, availableBalance: 0 })
      .where(eq(walletTable.id, fixture.walletIds[2]!));
    await makeEnrollment(fixture, 2, "full");
    const input = {
      classId: fixture.classId,
      expectedVersion: 1,
      reason: "Admin cancellation fixture",
    };
    const quote = await fixture.service.previewAdminCancellation(
      fixture.tutorId,
      input,
    );
    expect(quote).toMatchObject({
      feeMarks: 0,
      returnMarks: 124,
      retainedMarks: 0,
    });
    const confirm = {
      ...input,
      quoteVersion: quote.quoteVersion,
      requestKey: crypto.randomUUID(),
    };
    const result = await Promise.all([
      fixture.service.confirmAdminCancellation(fixture.tutorId, confirm),
      fixture.service.confirmAdminCancellation(fixture.tutorId, confirm),
    ]);
    expect(result[0]?.quoteVersion).toBe(result[1]?.quoteVersion);
    const balances = await db
      .select()
      .from(walletTable)
      .where(inArray(walletTable.id, fixture.walletIds));
    expect(
      balances.every(
        (row) =>
          row.heldBalance === 0 && row.availableBalance === row.totalBalance,
      ),
    ).toBe(true);
    expect(
      (await allocationRows(fixture)).every((row) => row.state === "released"),
    ).toBe(true);
    expect(fixture.notifications).toHaveLength(4);
    const rows = await enrollmentRows(fixture);
    expect(rows.every((row) => row.state === "cancelled")).toBe(true);
    expect(rows.find((row) => row.id === full.id)).toMatchObject({
      totalMarks: 80,
      firstInstallmentMarks: 80,
    });
    expect(
      (
        await fixture.service.getMyClassEnrollments(
          fixture.studentIds[0]!,
          fixture.classId,
        )
      ).enrollments[0]?.state,
    ).toBe("cancelled");
    await expect(
      fixture.service.getMyClassEnrollments(
        crypto.randomUUID(),
        fixture.classId,
      ),
    ).rejects.toThrow();
  });

  test("admin cancellation of a running cohort retains past delivery holds", async () => {
    const fixture = await createFixture({ sessions: 2, balance: 100 });
    await makeEnrollment(fixture, 0, "full");
    fixture.setNow(new Date(fixture.startAt[0]!.getTime() + 60_000));
    const input = {
      classId: fixture.classId,
      expectedVersion: 1,
      reason: "Cancel remaining delivery",
    };
    const quote = await fixture.service.previewAdminCancellation(
      fixture.tutorId,
      input,
    );
    expect(quote).toMatchObject({ returnMarks: 20, retainedMarks: 20 });
    await fixture.service.confirmAdminCancellation(fixture.tutorId, {
      ...input,
      quoteVersion: quote.quoteVersion,
      requestKey: crypto.randomUUID(),
    });
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance).toMatchObject({
      totalBalance: 100,
      heldBalance: 20,
      availableBalance: 80,
    });
    const sessions = await db
      .select()
      .from(academyClassSession)
      .where(eq(academyClassSession.classId, fixture.classId))
      .orderBy(academyClassSession.sequenceNumber);
    expect(sessions.map((row) => row.state)).toEqual([
      "scheduled",
      "cancelled",
    ]);
  });

  test("admin preview cannot cancel a newly funded checkout using an old return amount", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 0 });
    const enrollment = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    const input = {
      classId: fixture.classId,
      expectedVersion: 1,
      reason: "Cancel after quote race",
    };
    const quote = await fixture.service.previewAdminCancellation(
      fixture.tutorId,
      input,
    );
    expect(quote.returnMarks).toBe(0);
    await db
      .update(walletTable)
      .set({ totalBalance: 25, availableBalance: 25 })
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    await fixture.service.completeCheckout(
      fixture.studentIds[0]!,
      enrollment.id,
    );
    await expect(
      fixture.service.confirmAdminCancellation(fixture.tutorId, {
        ...input,
        quoteVersion: quote.quoteVersion,
        requestKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow("amounts changed");
    expect((await allocationRows(fixture))[0]?.state).toBe("funded");
    expect(
      (
        await db
          .select()
          .from(academyClass)
          .where(eq(academyClass.id, fixture.classId))
      )[0]?.state,
    ).toBe("published");
  });

  test("class calendar cancellation retries provider failure and becomes terminal", async () => {
    const fixture = await createFixture({ sessions: 1 });
    await db.insert(academyClassMeeting).values({
      sessionId: fixture.sessionIds[0]!,
      status: "created",
      externalEventId: "test-class-event-cancel",
      meetingUrl: "https://meet.google.com/test",
    });
    const input = {
      classId: fixture.classId,
      expectedVersion: 1,
      reason: "Cancel meeting retry test",
    };
    const quote = await fixture.service.previewAdminCancellation(
      fixture.tutorId,
      input,
    );
    await fixture.service.confirmAdminCancellation(fixture.tutorId, {
      ...input,
      quoteVersion: quote.quoteVersion,
      requestKey: crypto.randomUUID(),
    });
    let attempts = 0;
    const worker = createAcademyClassService({
      db,
      audit: {} as never,
      notification: {} as never,
      meeting: {
        cancelAcademyClassEvent: async (eventId: string) => {
          expect(eventId).toBe("test-class-event-cancel");
          attempts++;
          if (attempts === 1) throw new Error("Synthetic provider unavailable");
        },
        createAcademyClassEvent: async () => {
          throw new Error("Cancelled session must not create an event");
        },
      } as unknown as MeetingPort,
    });
    expect(await worker.processReadyMeetings(fixture.classId)).toMatchObject({
      processed: 1,
      failed: 1,
    });
    await db
      .update(academyClassMeeting)
      .set({ nextRetryAt: new Date(0) })
      .where(eq(academyClassMeeting.sessionId, fixture.sessionIds[0]!));
    expect(await worker.processReadyMeetings(fixture.classId)).toMatchObject({
      processed: 1,
      cancelled: 1,
    });
    expect(await worker.processReadyMeetings(fixture.classId)).toMatchObject({
      processed: 0,
    });
    expect(attempts).toBe(2);
    expect(
      (
        await db
          .select()
          .from(academyClassMeeting)
          .where(eq(academyClassMeeting.sessionId, fixture.sessionIds[0]!))
      )[0],
    ).toMatchObject({
      status: "cancelled",
      externalEventId: "test-class-event-cancel",
      meetingUrl: null,
    });
  });

  test("a class event created during cancellation is picked up for deletion after its worker commits", async () => {
    const fixture = await createFixture({ sessions: 1 });
    await db.insert(academyClassMeeting).values({
      sessionId: fixture.sessionIds[0]!,
      status: "pending",
      nextRetryAt: new Date(0),
    });
    let started!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let deleted = 0;
    const worker = createAcademyClassService({
      db,
      audit: {} as never,
      notification: {} as never,
      meeting: {
        createAcademyClassEvent: async () => {
          started();
          await gate;
          return {
            provider: "google_meet",
            status: "created",
            externalEventId: "test-class-event-race",
            meetingUrl: "https://meet.google.com/test",
            errorReason: null,
          };
        },
        cancelAcademyClassEvent: async (id: string) => {
          expect(id).toBe("test-class-event-race");
          deleted++;
        },
      } as unknown as MeetingPort,
    });
    const creating = worker.processReadyMeetings(fixture.classId);
    await entered;
    try {
      const input = {
        classId: fixture.classId,
        expectedVersion: 1,
        reason: "Cancel while provider is creating",
      };
      const quote = await fixture.service.previewAdminCancellation(
        fixture.tutorId,
        input,
      );
      await fixture.service.confirmAdminCancellation(fixture.tutorId, {
        ...input,
        quoteVersion: quote.quoteVersion,
        requestKey: crypto.randomUUID(),
      });
    } finally {
      finish();
    }
    await creating;
    expect(await worker.processReadyMeetings(fixture.classId)).toMatchObject({
      cancelled: 1,
    });
    expect(deleted).toBe(1);
  });
  test("a creator resuming after lease recovery queues another cancellation instead of losing the provider event", async () => {
    const fixture = await createFixture({ sessions: 1 });
    await db.insert(academyClassMeeting).values({
      sessionId: fixture.sessionIds[0]!,
      status: "pending",
      nextRetryAt: new Date(0),
    });
    let started!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const deleted: (string | null)[] = [];
    const worker = createAcademyClassService({
      db,
      audit: {} as never,
      notification: {} as never,
      meeting: {
        createAcademyClassEvent: async () => {
          started();
          await gate;
          return {
            provider: "google_meet",
            status: "created",
            externalEventId: "test-class-event-after-lease",
            meetingUrl: "https://meet.google.com/test",
            errorReason: null,
          };
        },
        cancelAcademyClassEvent: async (
          id: string | null,
          sessionId?: string,
        ) => {
          expect(sessionId).toBe(fixture.sessionIds[0]);
          deleted.push(id);
        },
      } as unknown as MeetingPort,
    });
    const creating = worker.processReadyMeetings(fixture.classId);
    await entered;
    try {
      const input = {
        classId: fixture.classId,
        expectedVersion: 1,
        reason: "Cancel expired creation lease",
      };
      const quote = await fixture.service.previewAdminCancellation(
        fixture.tutorId,
        input,
      );
      await fixture.service.confirmAdminCancellation(fixture.tutorId, {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: quote.quoteVersion,
      });
      await db
        .update(academyClassMeeting)
        .set({ lockedAt: new Date(0) })
        .where(eq(academyClassMeeting.sessionId, fixture.sessionIds[0]!));
      expect(await worker.processReadyMeetings(fixture.classId)).toMatchObject({
        cancelled: 1,
      });
    } finally {
      finish();
    }
    await creating;
    expect(
      (
        await db
          .select()
          .from(academyClassMeeting)
          .where(eq(academyClassMeeting.sessionId, fixture.sessionIds[0]!))
      )[0]?.status,
    ).toBe("pending");
    expect(await worker.processReadyMeetings(fixture.classId)).toMatchObject({
      cancelled: 1,
    });
    expect(deleted).toEqual([null, "test-class-event-after-lease"]);
  });

  test("admin cancellation rolls back every return if a later student release fails", async () => {
    let releases = 0;
    const fixture = await createFixture({
      sessions: 2,
      balance: 100,
      walletPort: {
        ...services.wallet,
        release: async (...args) => {
          releases++;
          if (releases === 2) throw new Error("Injected admin return failure");
          return services.wallet.release(...args);
        },
      },
    });
    await makeEnrollment(fixture, 0, "full");
    const input = {
      classId: fixture.classId,
      expectedVersion: 1,
      reason: "Atomic class cancellation",
    };
    const quote = await fixture.service.previewAdminCancellation(
      fixture.tutorId,
      input,
    );
    await expect(
      fixture.service.confirmAdminCancellation(fixture.tutorId, {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: quote.quoteVersion,
      }),
    ).rejects.toThrow("Injected admin return failure");
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance).toMatchObject({
      totalBalance: 100,
      availableBalance: 60,
      heldBalance: 40,
    });
    expect(
      (await allocationRows(fixture)).every(
        (row) => row.state === "funded" && row.releasedMarks === 0,
      ),
    ).toBe(true);
    expect(
      (
        await db
          .select()
          .from(academyClass)
          .where(eq(academyClass.id, fixture.classId))
      )[0]?.state,
    ).toBe("published");
    expect(fixture.notifications).toHaveLength(0);
  });
});

describe("T06 class lifecycle minimum, postponement and session cancellation", () => {
  test("minimum checks count only active paid full/half students and continue is audited", async () => {
    const fixture = await createFixture({
      sessions: 4,
      capacity: 10,
      balance: 100,
      studentCount: 6,
    });
    await db
      .update(academyClass)
      .set({ minimumEnrollment: 4 })
      .where(eq(academyClass.id, fixture.classId));
    await makeEnrollment(fixture, 0, "full");
    await makeEnrollment(fixture, 1, "half");
    await makeEnrollment(
      fixture,
      2,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );

    await db
      .update(walletTable)
      .set({ totalBalance: 0, availableBalance: 0 })
      .where(eq(walletTable.id, fixture.walletIds[3]!));
    const checkout = await makeEnrollment(fixture, 3, "full");
    expect(checkout.state).toBe("checkout_pending");
    fixture.setNow(new Date(BASE_TIME.getTime() + 16 * 60_000));
    expect(
      (
        await fixture.service.completeCheckout(
          fixture.studentIds[3]!,
          checkout.id,
        )
      ).outcome,
    ).toBe("expired");

    const defaulted = await makeEnrollment(fixture, 4, "half");
    fixture.setNow(fixture.startAt[2]!);
    expect(
      (
        await fixture.service.paySecondInstallment(
          fixture.studentIds[4]!,
          defaulted.id,
        )
      ).outcome,
    ).toBe("defaulted");

    fixture.setNow(BASE_TIME);
    const cancelled = await makeEnrollment(fixture, 5, "full");
    const cancellation = await fixture.service.quoteCancellation(
      fixture.studentIds[5]!,
      { enrollmentId: cancelled.id },
    );
    await fixture.service.confirmCancellation(fixture.studentIds[5]!, {
      enrollmentId: cancelled.id,
      requestKey: crypto.randomUUID(),
      quoteVersion: cancellation.quoteVersion,
    });

    const minimum = await fixture.service.getAdminMinimumCheck(fixture.classId);
    expect(minimum).toMatchObject({
      eligible: true,
      minimumEnrollment: 4,
      activeFullHalfStudents: 2,
      shortfall: 2,
    });

    const adminId = await createReportAdmin();
    const input = {
      classId: fixture.classId,
      expectedClassVersion: 1,
      decision: "continue" as const,
      reason: "Continue with documented cohort shortfall",
      replacementStarts: [],
    };
    const preview = await fixture.service.previewAdminMinimumDecision(input);
    const result = await fixture.service.confirmAdminMinimumDecision(adminId, {
      ...input,
      requestKey: crypto.randomUUID(),
      quoteVersion: preview.quoteVersion,
    });
    expect(result).toMatchObject({
      decision: "continue",
      activeFullHalfStudents: 2,
      shortfall: 2,
      freeExitUntil: null,
      classVersion: 2,
    });
    expect(
      (await fixture.service.getAdminMinimumCheck(fixture.classId))
        .minimumCheckResolvedAt,
    ).toBeInstanceOf(Date);
  });

  test("individual cancellation rejects a stale funding quote and replays one return", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 0 });
    const enrollment = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    const input = {
      classId: fixture.classId,
      sessionId: fixture.sessionIds[0]!,
      expectedClassVersion: 1,
      expectedSessionVersion: 1,
      reason: "Cancel the future session before delivery",
    };
    const staleQuote = await fixture.service.previewAdminSessionCancellation(
      fixture.tutorId,
      input,
    );
    await db
      .update(walletTable)
      .set({ totalBalance: 25, availableBalance: 25 })
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    await fixture.service.completeCheckout(
      fixture.studentIds[0]!,
      enrollment.id,
    );
    await expect(
      fixture.service.confirmAdminSessionCancellation(fixture.tutorId, {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: staleQuote.quoteVersion,
      }),
    ).rejects.toThrow("payments changed");

    const quote = await fixture.service.previewAdminSessionCancellation(
      fixture.tutorId,
      input,
    );
    expect(quote).toMatchObject({ feeMarks: 0, returnMarks: 25 });
    const confirmation = {
      ...input,
      requestKey: crypto.randomUUID(),
      quoteVersion: quote.quoteVersion,
    };
    const [first, replay] = await Promise.all([
      fixture.service.confirmAdminSessionCancellation(
        fixture.tutorId,
        confirmation,
      ),
      fixture.service.confirmAdminSessionCancellation(
        fixture.tutorId,
        confirmation,
      ),
    ]);
    expect(first).toEqual(replay);
    expect(first.releasedAllocationIds).toHaveLength(1);
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance).toMatchObject({
      totalBalance: 25,
      heldBalance: 0,
      availableBalance: 25,
    });
    expect(
      (
        await db
          .select()
          .from(academyClassSession)
          .where(eq(academyClassSession.id, fixture.sessionIds[0]!))
      )[0],
    ).toMatchObject({ state: "cancelled", version: 2 });
    expect((await enrollmentRows(fixture))[0]).toMatchObject({
      state: "active",
      sessionCount: 1,
      totalMarks: 25,
    });
    expect(
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "academy_class.session_cancelled"),
            eq(auditLog.targetId, fixture.sessionIds[0]!),
          ),
        ),
    ).toHaveLength(1);
  });

  test("session cancellation and half payment serialize without charging the cancelled seat", async () => {
    const fixture = await createFixture({ sessions: 4, balance: 100 });
    const enrollment = await makeEnrollment(fixture, 0, "half");
    const sessionId = fixture.sessionIds[2]!;
    const input = {
      classId: fixture.classId,
      sessionId,
      expectedClassVersion: 1,
      expectedSessionVersion: 1,
      reason: "Remove one future seat from the half plan",
    };
    const quote = await fixture.service.previewAdminSessionCancellation(
      fixture.tutorId,
      input,
    );
    const confirmInput = {
      ...input,
      requestKey: crypto.randomUUID(),
      quoteVersion: quote.quoteVersion,
    };
    const [cancelResult, paymentResult] = await Promise.allSettled([
      fixture.service.confirmAdminSessionCancellation(
        fixture.tutorId,
        confirmInput,
      ),
      fixture.service.paySecondInstallment(
        fixture.studentIds[0]!,
        enrollment.id,
      ),
    ]);
    if (cancelResult.status === "rejected") {
      const freshQuote = await fixture.service.previewAdminSessionCancellation(
        fixture.tutorId,
        input,
      );
      await fixture.service.confirmAdminSessionCancellation(fixture.tutorId, {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: freshQuote.quoteVersion,
      });
    }
    if (paymentResult.status === "rejected") {
      const [secondBeforeRetry] = await db
        .select()
        .from(academyClassEnrollmentInstallment)
        .where(
          and(
            eq(academyClassEnrollmentInstallment.enrollmentId, enrollment.id),
            eq(academyClassEnrollmentInstallment.ordinal, 2),
          ),
        );
      const [walletBeforeRetry] = await db
        .select()
        .from(walletTable)
        .where(eq(walletTable.id, fixture.walletIds[0]!));
      expect(secondBeforeRetry).toMatchObject({
        state: "pending",
        sessionCount: 1,
        amountMarks: 22,
      });
      expect(walletBeforeRetry).toMatchObject({
        totalBalance: 100,
        heldBalance: 44,
        availableBalance: 56,
      });
      expect(
        (
          await fixture.service.paySecondInstallment(
            fixture.studentIds[0]!,
            enrollment.id,
          )
        ).outcome,
      ).toBe("funded");
    }
    const rows = await allocationRows(fixture);
    const cancelledAllocation = rows.find((row) => row.sessionId === sessionId);
    expect(cancelledAllocation).toMatchObject({
      state: "released",
      rateMarks: 22,
      spentMarks: 0,
    });
    const second = await db
      .select()
      .from(academyClassEnrollmentInstallment)
      .where(
        and(
          eq(academyClassEnrollmentInstallment.enrollmentId, enrollment.id),
          eq(academyClassEnrollmentInstallment.ordinal, 2),
        ),
      );
    expect(second[0]).toMatchObject({
      state: "funded",
      rateMarks: 22,
    });
    expect(second[0]?.sessionCount).toBe(1);
    expect(second[0]?.amountMarks).toBe(22);
    const [balance] = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(balance).toMatchObject({
      totalBalance: 100,
      heldBalance: 66,
      availableBalance: 34,
    });
    expect((await enrollmentRows(fixture))[0]).toMatchObject({
      sessionCount: 4,
      totalMarks: 88,
    });
  });

  test("minimum postponement enforces strict 72 hours, grants one free exit, and preserves snapshots", async () => {
    const fixture = await createFixture({ sessions: 4, balance: 100 });
    const enrollment = await makeEnrollment(fixture, 0, "half");
    const adminId = await createReportAdmin();
    const freeExitUntil = new Date(BASE_TIME.getTime() + 72 * 60 * 60 * 1000);
    const input = {
      classId: fixture.classId,
      expectedClassVersion: 1,
      decision: "postpone" as const,
      reason: "Postpone once to address minimum enrollment",
      replacementStarts: fixture.sessionIds.map((sessionId, index) => ({
        sessionId,
        expectedSessionVersion: 1,
        startAt: new Date(freeExitUntil.getTime() + 1 + index * 2 * DAY_MS),
      })),
    };
    await expect(
      fixture.service.previewAdminMinimumDecision({
        ...input,
        replacementStarts: input.replacementStarts.map((session, index) => ({
          ...session,
          startAt: new Date(freeExitUntil.getTime() + index * 2 * DAY_MS),
        })),
      }),
    ).rejects.toThrow("after the 72-hour free-exit deadline");

    const allocationsBefore = await allocationRows(fixture);
    const preview = await fixture.service.previewAdminMinimumDecision(input);
    const confirmation = {
      ...input,
      requestKey: crypto.randomUUID(),
      quoteVersion: preview.quoteVersion,
    };
    const [postponed, replay] = await Promise.all([
      fixture.service.confirmAdminMinimumDecision(adminId, confirmation),
      fixture.service.confirmAdminMinimumDecision(adminId, confirmation),
    ]);
    expect(replay).toEqual(postponed);
    expect(postponed).toMatchObject({
      classVersion: 2,
      freeExitUntil,
    });
    const classRecord = await db.query.academyClass.findFirst({
      where: eq(academyClass.id, fixture.classId),
    });
    expect(classRecord).toMatchObject({
      state: "postponed",
      postponementCount: 1,
      minimumCheckResolvedAt: BASE_TIME,
      freeExitUntil,
      version: 2,
    });
    const sessions = await db
      .select()
      .from(academyClassSession)
      .where(eq(academyClassSession.classId, fixture.classId))
      .orderBy(academyClassSession.sequenceNumber);
    expect(sessions.map((session) => session.id)).toEqual(fixture.sessionIds);
    expect(sessions.every((session) => session.version === 2)).toBe(true);
    expect(sessions[0]?.startAt).toEqual(input.replacementStarts[0]?.startAt);
    expect(await allocationRows(fixture)).toEqual(allocationsBefore);
    expect((await enrollmentRows(fixture))[0]).toMatchObject({
      id: enrollment.id,
      plan: "half",
      firstRateMarks: 22,
      secondRateMarks: 22,
      totalMarks: 88,
    });
    await expect(
      fixture.service.previewAdminMinimumDecision({
        ...input,
        expectedClassVersion: 2,
        replacementStarts: input.replacementStarts.map((session) => ({
          ...session,
          expectedSessionVersion: 2,
        })),
      }),
    ).rejects.toThrow("only once");

    fixture.setNow(freeExitUntil);
    const exitQuote = await fixture.service.quoteCancellation(
      fixture.studentIds[0]!,
      { enrollmentId: enrollment.id },
    );
    expect(exitQuote).toMatchObject({
      freeExit: true,
      freeExitUntil,
      feeRateBps: 0,
      feeMarks: 0,
      returnMarks: 44,
      unpaidAllocationIds: expect.arrayContaining(
        allocationsBefore
          .filter((allocation) => allocation.state === "unfunded_reserved")
          .map((allocation) => allocation.id),
      ),
    });
    await fixture.service.confirmCancellation(fixture.studentIds[0]!, {
      enrollmentId: enrollment.id,
      requestKey: crypto.randomUUID(),
      quoteVersion: exitQuote.quoteVersion,
    });
    const beforeSecondPay = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(beforeSecondPay[0]).toMatchObject({
      totalBalance: 100,
      heldBalance: 0,
      availableBalance: 100,
    });
    expect(
      (
        await fixture.service.paySecondInstallment(
          fixture.studentIds[0]!,
          enrollment.id,
        )
      ).outcome,
    ).toBe("expired");
    const afterSecondPay = await db
      .select()
      .from(walletTable)
      .where(eq(walletTable.id, fixture.walletIds[0]!));
    expect(afterSecondPay[0]).toMatchObject({
      heldBalance: 0,
      availableBalance: 100,
    });
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(
          eq(tutorSessionFee.academyClassSessionId, fixture.sessionIds[0]!),
        ),
    ).toHaveLength(0);
  });

  test("calendar update failures retry the same event after postponement", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 100 });
    const sessionId = fixture.sessionIds[0]!;
    await db.insert(academyClassMeeting).values({
      sessionId,
      provider: "google_meet",
      status: "created",
      externalEventId: `test-class-event-${sessionId}`,
      meetingUrl: `https://meet.example.test/${sessionId}`,
    });
    const adminId = await createReportAdmin();
    const startAt = new Date(fixture.startAt[0]!.getTime() + 2 * DAY_MS);
    const input = {
      classId: fixture.classId,
      expectedClassVersion: 1,
      decision: "postpone" as const,
      reason: "Move this cohort after the penalty-free exit",
      replacementStarts: [{ sessionId, expectedSessionVersion: 1, startAt }],
    };
    const preview = await fixture.service.previewAdminMinimumDecision(input);
    await fixture.service.confirmAdminMinimumDecision(adminId, {
      ...input,
      requestKey: crypto.randomUUID(),
      quoteVersion: preview.quoteVersion,
    });

    let updates = 0;
    const updatedEvents: Array<{
      id: string | null;
      sessionId: string;
      startAt: Date;
    }> = [];
    const worker = createAcademyClassService({
      db,
      audit: {} as never,
      notification: {} as never,
      meeting: {
        createAcademyClassEvent: async () => {
          throw new Error("A created event must be updated, not duplicated");
        },
        updateAcademyClassEvent: async (
          externalEventId,
          updatedSessionId,
          nextStart,
        ) => {
          updatedEvents.push({
            id: externalEventId,
            sessionId: updatedSessionId,
            startAt: nextStart,
          });
          updates++;
          if (updates === 1)
            throw new Error("Injected transient calendar failure");
        },
        cancelAcademyClassEvent: async () => {},
        createEvent: async () => {
          throw new Error("Booking calendar is outside this worker test");
        },
        updateEvent: async () => {},
        cancelEvent: async () => {},
        setManualLink: async () => {
          throw new Error("Manual links are outside this worker test");
        },
      } as MeetingPort,
    });
    expect(await worker.processReadyMeetings(fixture.classId)).toMatchObject({
      processed: 1,
      failed: 1,
    });
    await db
      .update(academyClassMeeting)
      .set({ nextRetryAt: new Date(0) })
      .where(eq(academyClassMeeting.sessionId, sessionId));
    const retryResult = await worker.processReadyMeetings(fixture.classId);
    const [retriedMeeting] = await db
      .select()
      .from(academyClassMeeting)
      .where(eq(academyClassMeeting.sessionId, sessionId));
    expect({
      ...retryResult,
      errorReason: retriedMeeting?.errorReason,
    }).toMatchObject({
      processed: 1,
      created: 1,
      errorReason: null,
    });
    expect(await worker.processReadyMeetings(fixture.classId)).toMatchObject({
      processed: 0,
    });
    expect(updatedEvents).toEqual([
      { id: `test-class-event-${sessionId}`, sessionId, startAt },
      { id: `test-class-event-${sessionId}`, sessionId, startAt },
    ]);
    const [meeting] = await db
      .select()
      .from(academyClassMeeting)
      .where(eq(academyClassMeeting.sessionId, sessionId));
    expect(meeting).toMatchObject({
      status: "created",
      scheduleVersion: 2,
      meetingUrl: `https://meet.example.test/${sessionId}`,
    });
  });

  test("a report racing a session cancellation retains delivery and fee facts", async () => {
    const fixture = await createFixture({ sessions: 2, balance: 100 });
    await makeEnrollment(fixture, 0, "full");
    const sessionId = fixture.sessionIds[0]!;
    const input = {
      classId: fixture.classId,
      sessionId,
      expectedClassVersion: 1,
      expectedSessionVersion: 1,
      reason: "Cancel while the delivery report is starting",
    };
    const quote = await fixture.service.previewAdminSessionCancellation(
      fixture.tutorId,
      input,
    );
    let releaseEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      releaseEntered = resolve;
    });
    let allowRelease!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      allowRelease = resolve;
    });
    const gatedWallet = {
      ...services.wallet,
      release: async (...args: Parameters<typeof services.wallet.release>) => {
        releaseEntered();
        await releaseGate;
        return services.wallet.release(...args);
      },
    } as typeof services.wallet;
    const cancellationService = makeService(
      fixture.getNow,
      fixture.notifications,
      gatedWallet,
    );
    const cancellation = cancellationService.confirmAdminSessionCancellation(
      fixture.tutorId,
      {
        ...input,
        requestKey: crypto.randomUUID(),
        quoteVersion: quote.quoteVersion,
      },
    );
    await entered;
    fixture.setNow(new Date(fixture.startAt[0]!.getTime() + 60 * 60_000 + 1));
    const report = fixture.service.submitSessionReport(
      fixture.tutorId,
      "tutor",
      makeClassReportInput(fixture),
    );
    allowRelease();
    const [cancelResult, reportResult] = await Promise.allSettled([
      cancellation,
      report,
    ]);
    expect(cancelResult.status).toBe("rejected");
    expect(reportResult.status).toBe("fulfilled");
    expect(
      (
        await db
          .select()
          .from(academyClassSession)
          .where(eq(academyClassSession.id, sessionId))
      )[0]?.state,
    ).toBe("completed");
    expect(
      await db
        .select()
        .from(academyClassSessionReport)
        .where(eq(academyClassSessionReport.sessionId, sessionId)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.academyClassSessionId, sessionId)),
    ).toHaveLength(1);
    expect(
      (await allocationRows(fixture)).find(
        (allocation) => allocation.sessionId === sessionId,
      ),
    ).toMatchObject({
      state: "funded",
      spentMarks: 20,
      releasedMarks: 0,
    });
  });
});

describe("class session reports and settlement [REQ-REPORT-01..03]", () => {
  test("concurrent identical submission settles a funded seat once and exposes no student identity", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 25 });
    await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    fixture.setNow(new Date(fixture.startAt[0]!.getTime() + 60 * 60_000 + 1));
    const input = makeClassReportInput(fixture);

    const [first, replay] = await Promise.all([
      fixture.service.submitSessionReport(fixture.tutorId, "tutor", input),
      fixture.service.submitSessionReport(fixture.tutorId, "tutor", input),
    ]);

    expect(first.id).toBe(replay.id);
    expect(first.version).toBe(1);
    await expect(
      fixture.service.submitSessionReport(fixture.tutorId, "tutor", {
        ...input,
        requestKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow("changed");
    expect((await allocationRows(fixture))[0]).toMatchObject({
      state: "funded",
      fundedMarks: 25,
      spentMarks: 25,
      releasedMarks: 0,
    });
    const deductions = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          inArray(ledgerEntry.walletId, fixture.walletIds),
          eq(ledgerEntry.entryType, "deduct"),
        ),
      );
    expect(deductions).toHaveLength(1);
    const fees = await db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.academyClassSessionId, fixture.sessionIds[0]!));
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({
      bookingId: null,
      bookingSessionId: null,
      academyClassSessionId: fixture.sessionIds[0],
      collectedMarks: 25,
      eventKey: `academy-class-session:${fixture.sessionIds[0]}:earned-fee`,
      grossHonorariumIdr: 400_000,
      priceSnapshot: null,
    });
    expect(
      await db
        .select()
        .from(academyClassSessionReportRevision)
        .where(eq(academyClassSessionReportRevision.reportId, first.id)),
    ).toHaveLength(1);

    const studentView = await fixture.service.listSessionReports(
      fixture.studentIds[0]!,
      "student",
      { classId: fixture.classId },
    );
    expect(studentView).toHaveLength(1);
    expect(studentView[0]?.report?.id).toBe(first.id);
    expect(studentView[0]?.settlement).toBeNull();
    expect(studentView[0]).not.toHaveProperty("studentId");
    expect(studentView[0]).not.toHaveProperty("privateMeet");
    const tutorView = await fixture.service.listSessionReports(
      fixture.tutorId,
      "tutor",
      { classId: fixture.classId },
    );
    expect(tutorView[0]?.settlement).toEqual({
      deductedMarks: 25,
      tutorFeeIdr: 400_000,
      settled: true,
    });

    await expect(
      fixture.service.submitSessionReport(
        fixture.studentIds[0]!,
        "student",
        input,
      ),
    ).rejects.toThrow();
    await expect(
      fixture.service.submitSessionReport(fixture.studentIds[0]!, "tutor", {
        ...input,
        requestKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      fixture.service.submitSessionReport(fixture.tutorId, "tutor", {
        ...input,
        feedback: {
          ...CLASS_REPORT_FEEDBACK,
          improvements: ["Different text under the original request key."],
        },
      }),
    ).rejects.toThrow("already used with different content");
    await expect(
      fixture.service.submitSessionReport(fixture.tutorId, "tutor", {
        ...input,
        requestKey: crypto.randomUUID(),
        feedback: {
          ...CLASS_REPORT_FEEDBACK,
          improvements: ["A stale write with changed content."],
        },
      }),
    ).rejects.toThrow("changed");
  });

  test("early-released seats cannot read reports or change the flat delivered fee; admin corrections add history only", async () => {
    const fixture = await createFixture({
      sessions: 1,
      studentCount: 2,
      balance: 25,
    });
    const earlyEnrollment = await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    await makeEnrollment(
      fixture,
      1,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    const cancellationInput = {
      enrollmentId: earlyEnrollment.id,
      sessionId: fixture.sessionIds[0]!,
    };
    const quote = await fixture.service.quoteCancellation(
      fixture.studentIds[0]!,
      cancellationInput,
    );
    await fixture.service.confirmCancellation(fixture.studentIds[0]!, {
      ...cancellationInput,
      requestKey: crypto.randomUUID(),
      quoteVersion: quote.quoteVersion,
    });
    fixture.setNow(new Date(fixture.startAt[0]!.getTime() + 60 * 60_000 + 1));

    const input = makeClassReportInput(fixture);
    const report = await fixture.service.submitSessionReport(
      fixture.tutorId,
      "tutor",
      input,
    );
    const allocations = await allocationRows(fixture);
    expect(
      allocations.find((row) => row.studentId === fixture.studentIds[0]),
    ).toMatchObject({
      state: "released",
      spentMarks: 5,
      releasedMarks: 20,
    });
    expect(
      allocations.find((row) => row.studentId === fixture.studentIds[1]),
    ).toMatchObject({
      state: "funded",
      spentMarks: 25,
    });
    const [fee] = await db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.academyClassSessionId, fixture.sessionIds[0]!));
    expect(fee).toMatchObject({
      grossHonorariumIdr: 400_000,
      collectedMarks: 25,
    });
    expect(
      await fixture.service.listSessionReports(
        fixture.studentIds[0]!,
        "student",
        {
          classId: fixture.classId,
        },
      ),
    ).toHaveLength(0);
    const eligibleStudentView = await fixture.service.listSessionReports(
      fixture.studentIds[1]!,
      "student",
      { classId: fixture.classId },
    );
    expect(eligibleStudentView).toHaveLength(1);
    expect(eligibleStudentView[0]?.report?.id).toBe(report.id);
    expect(eligibleStudentView[0]).not.toHaveProperty("studentId");

    const adminId = await createReportAdmin();
    const correctedFeedback = {
      ...CLASS_REPORT_FEEDBACK,
      improvements: [
        "Show each intermediate calculation in the worked example.",
      ],
    };
    const correction = makeClassReportInput(fixture, {
      expectedVersion: 1,
      requestKey: crypto.randomUUID(),
      feedback: correctedFeedback,
      adminReason: "Correct wording after the tutor review",
    });
    await expect(
      fixture.service.submitSessionReport(adminId, "admin", {
        ...correction,
        requestKey: crypto.randomUUID(),
        adminReason: undefined,
      }),
    ).rejects.toThrow("reason is required");
    const deductionsBeforeCorrection = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          inArray(ledgerEntry.walletId, fixture.walletIds),
          eq(ledgerEntry.entryType, "deduct"),
        ),
      );
    const corrected = await fixture.service.submitSessionReport(
      adminId,
      "admin",
      correction,
    );
    expect(corrected).toMatchObject({ id: report.id, version: 2 });
    await fixture.service.submitSessionReport(adminId, "admin", correction);
    await expect(
      fixture.service.submitSessionReport(adminId, "admin", {
        ...correction,
        feedback: CLASS_REPORT_FEEDBACK,
      }),
    ).rejects.toThrow("already used with different content");
    await expect(
      fixture.service.submitSessionReport(adminId, "admin", {
        ...correction,
        requestKey: crypto.randomUUID(),
        feedback: {
          ...correctedFeedback,
          strengths: ["A stale correction."],
        },
      }),
    ).rejects.toThrow("changed");

    const deductionsAfterCorrection = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          inArray(ledgerEntry.walletId, fixture.walletIds),
          eq(ledgerEntry.entryType, "deduct"),
        ),
      );
    expect(deductionsAfterCorrection).toHaveLength(
      deductionsBeforeCorrection.length,
    );
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(
          eq(tutorSessionFee.academyClassSessionId, fixture.sessionIds[0]!),
        ),
    ).toHaveLength(1);
    const revisions = await db
      .select()
      .from(academyClassSessionReportRevision)
      .where(eq(academyClassSessionReportRevision.reportId, report.id));
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({
      actorId: adminId,
      actorRole: "admin",
      adminReason: "Correct wording after the tutor review",
      version: 2,
    });
    const reportAudits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, report.id));
    expect(reportAudits.map((row) => row.action).sort()).toEqual([
      "academy_class_session.report_submitted",
      "academy_class_session.report_updated",
    ]);
    expect(
      fixture.notifications.find(
        (row) =>
          row.eventKey ===
          `academy-class-session:${fixture.sessionIds[0]}:admin-report:v2:tutor`,
      ),
    ).toMatchObject({ userId: fixture.tutorId, category: "override" });
  });

  test("report history and correction rights stay with the delivery tutor after reassignment", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 25 });
    await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    fixture.setNow(new Date(fixture.startAt[0]!.getTime() + 60 * 60_000 + 1));
    const report = await fixture.service.submitSessionReport(
      fixture.tutorId,
      "tutor",
      makeClassReportInput(fixture),
    );

    const replacementTutorId = crypto.randomUUID();
    await db.insert(user).values({
      id: replacementTutorId,
      name: "Replacement enrollment test tutor",
      email: `enrollment-replacement-${crypto.randomUUID()}@example.test`,
      emailVerified: true,
      role: "tutor",
    });
    ownedUserIds.add(replacementTutorId);
    await db
      .update(academyClassSession)
      .set({ tutorId: replacementTutorId })
      .where(eq(academyClassSession.id, fixture.sessionIds[0]!));

    const originalTutorRows = await fixture.service.listSessionReports(
      fixture.tutorId,
      "tutor",
      { classId: fixture.classId },
    );
    const replacementTutorRows = await fixture.service.listSessionReports(
      replacementTutorId,
      "tutor",
      { classId: fixture.classId },
    );
    expect(originalTutorRows.map((row) => row.sessionId)).toEqual([
      fixture.sessionIds[0],
    ]);
    expect(replacementTutorRows).toHaveLength(0);
    await expect(
      fixture.service.submitSessionReport(replacementTutorId, "tutor", {
        ...makeClassReportInput(fixture, { expectedVersion: 1 }),
        requestKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
    expect(originalTutorRows[0]?.report?.id).toBe(report.id);
  });

  test("a later wallet failure rolls back the first deduction and report writes", async () => {
    let deductions = 0;
    const walletPort = {
      ...services.wallet,
      deduct: async (...args: Parameters<typeof services.wallet.deduct>) => {
        deductions += 1;
        if (deductions === 2)
          throw new Error("Injected class report deduction failure");
        return services.wallet.deduct(...args);
      },
    };
    const fixture = await createFixture({
      sessions: 1,
      studentCount: 2,
      balance: 25,
      walletPort,
    });
    await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    await makeEnrollment(
      fixture,
      1,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    fixture.setNow(new Date(fixture.startAt[0]!.getTime() + 60 * 60_000 + 1));

    await expect(
      fixture.service.submitSessionReport(
        fixture.tutorId,
        "tutor",
        makeClassReportInput(fixture),
      ),
    ).rejects.toThrow("Injected class report deduction failure");

    expect(deductions).toBe(2);
    expect(
      await db
        .select()
        .from(academyClassSessionReport)
        .where(eq(academyClassSessionReport.sessionId, fixture.sessionIds[0]!)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(
          eq(tutorSessionFee.academyClassSessionId, fixture.sessionIds[0]!),
        ),
    ).toHaveLength(0);
    expect(
      (await allocationRows(fixture)).every((row) => row.spentMarks === 0),
    ).toBe(true);
    const walletRows = await db
      .select()
      .from(walletTable)
      .where(inArray(walletTable.id, fixture.walletIds));
    expect(
      walletRows.every(
        (row) => row.totalBalance === 25 && row.heldBalance === 25,
      ),
    ).toBe(true);
    expect(
      await db
        .select()
        .from(ledgerEntry)
        .where(
          and(
            inArray(ledgerEntry.walletId, fixture.walletIds),
            eq(ledgerEntry.entryType, "deduct"),
          ),
        ),
    ).toHaveLength(0);
    expect(
      fixture.notifications.filter((row) =>
        String(row.eventKey).startsWith("academy-class-session:"),
      ),
    ).toHaveLength(0);
    const [session] = await db
      .select()
      .from(academyClassSession)
      .where(eq(academyClassSession.id, fixture.sessionIds[0]!));
    expect(session?.state).toBe("scheduled");
  });

  test("a retained past seat settles after parent cancellation without reviving the class", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 25 });
    await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    await db
      .update(academyClass)
      .set({ state: "cancelled" })
      .where(eq(academyClass.id, fixture.classId));
    fixture.setNow(new Date(fixture.startAt[0]!.getTime() + 60 * 60_000 + 1));

    expect(
      (
        await fixture.service.listSessionReports(fixture.tutorId, "tutor", {})
      )[0]?.settlement,
    ).toEqual({ deductedMarks: 25, tutorFeeIdr: 400_000, settled: false });

    await fixture.service.submitSessionReport(
      fixture.tutorId,
      "tutor",
      makeClassReportInput(fixture),
    );
    expect(
      (
        await fixture.service.listSessionReports(fixture.tutorId, "tutor", {})
      )[0]?.settlement,
    ).toEqual({ deductedMarks: 25, tutorFeeIdr: 400_000, settled: true });

    const [session] = await db
      .select()
      .from(academyClassSession)
      .where(eq(academyClassSession.id, fixture.sessionIds[0]!));
    const [classRow] = await db
      .select()
      .from(academyClass)
      .where(eq(academyClass.id, fixture.classId));
    expect(session?.state).toBe("completed");
    expect(classRow?.state).toBe("cancelled");
    expect((await allocationRows(fixture))[0]).toMatchObject({
      spentMarks: 25,
    });
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(
          eq(tutorSessionFee.academyClassSessionId, fixture.sessionIds[0]!),
        ),
    ).toHaveLength(1);
  });

  test("a delivered session with zero chargeable seats creates no tutor fee", async () => {
    const fixture = await createFixture({ sessions: 1 });
    fixture.setNow(new Date(fixture.startAt[0]!.getTime() + 60 * 60_000 + 1));

    const report = await fixture.service.submitSessionReport(
      fixture.tutorId,
      "tutor",
      makeClassReportInput(fixture),
    );

    expect(report.version).toBe(1);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(
          eq(tutorSessionFee.academyClassSessionId, fixture.sessionIds[0]!),
        ),
    ).toHaveLength(0);
    const [session] = await db
      .select()
      .from(academyClassSession)
      .where(eq(academyClassSession.id, fixture.sessionIds[0]!));
    const [classRow] = await db
      .select()
      .from(academyClass)
      .where(eq(academyClass.id, fixture.classId));
    expect(session?.state).toBe("completed");
    expect(classRow?.state).toBe("completed");
  });

  test("payout preview selects the real class fee with collected Marks and exact net", async () => {
    const fixture = await createFixture({ sessions: 1, balance: 25 });
    await makeEnrollment(
      fixture,
      0,
      "single",
      crypto.randomUUID(),
      fixture.sessionIds[0],
    );
    const reportNow = new Date();
    await db
      .update(academyClassSession)
      .set({
        startAt: new Date(reportNow.getTime() - 2 * 60 * 60_000),
        endAt: new Date(reportNow.getTime() - 60 * 60_000),
      })
      .where(eq(academyClassSession.id, fixture.sessionIds[0]!));
    fixture.setNow(reportNow);
    await fixture.service.submitSessionReport(
      fixture.tutorId,
      "tutor",
      makeClassReportInput(fixture),
    );
    const [fee] = await db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.academyClassSessionId, fixture.sessionIds[0]!));
    expect(fee).toBeDefined();

    const inviteId = crypto.randomUUID();
    await db.insert(tutorInvite).values({
      id: inviteId,
      email: `class-payout-${inviteId}@example.test`,
      displayName: "Enrollment test tutor",
      token: `class-payout-${inviteId}`,
      status: "accepted",
      invitedBy: fixture.tutorId,
      acceptedBy: fixture.tutorId,
      expiresAt: new Date(reportNow.getTime() + DAY_MS),
      acceptedAt: reportNow,
    });
    await db.insert(tutorProfile).values({
      userId: fixture.tutorId,
      inviteId,
      onboardingStatus: "published",
      publishedAt: reportNow,
      bankName: "Mandiri",
      bankAccountNumber: "001234567890",
      bankAccountHolderName: "Enrollment Test Tutor",
      bankAccountOpeningCity: "Jakarta",
      bankAccountOwnership: "self",
      bankTransferDisclaimerAccepted: true,
      taxLegalName: "Enrollment Test Tutor",
      nik: "0012345678901234",
    });

    const preview = await services.booking.previewTutorPayout(fixture.tutorId, [
      fee!.eventKey,
    ]);
    expect(preview).toMatchObject({
      grossHonorariumIdr: 400_000,
      taxRateBps: 300,
      taxHonorariumIdr: 12_000,
      transferFeeIdr: 2_500,
      netHonorariumIdr: 385_500,
    });
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({
      sourceKey: fee!.eventKey,
      bookingId: null,
      bookingNumber: null,
      bookingSessionId: null,
      classSessionId: fixture.sessionIds[0],
      bookingType: "cohort",
      deliveryLabel: expect.stringContaining("Session 1"),
      collectedMarks: 25,
      priceSnapshot: null,
      grossHonorariumIdr: 400_000,
    });

    const adminId = await createReportAdmin();
    const prepared = await services.booking.prepareTutorPayout(adminId, {
      tutorId: fixture.tutorId,
      sourceKeys: preview.sourceKeys,
      previewVersion: preview.previewVersion,
      operationId: crypto.randomUUID(),
    });
    ownedPayoutIds.add(prepared.id);
    const [payoutAllocation] = await db
      .select()
      .from(tutorPayoutAllocation)
      .where(eq(tutorPayoutAllocation.payoutId, prepared.id));
    expect(payoutAllocation).toMatchObject({
      sourceType: "fee_event",
      tutorSessionFeeId: fee!.id,
      bookingId: null,
      bookingSessionId: null,
      academyClassSessionId: fixture.sessionIds[0],
      deliveryLabel: fee!.deliveryLabel,
      bookingType: "cohort",
      collectedMarks: 25,
      grossHonorariumIdr: 400_000,
      priceSnapshot: null,
    });
  });
});
