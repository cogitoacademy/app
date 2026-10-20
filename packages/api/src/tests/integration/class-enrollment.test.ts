import { afterAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  academyClass,
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassSession,
  ledgerEntry,
  subjectCategory,
  user,
  wallet as walletTable,
} from "@cogito-app/db/schema";
import { createTestClient } from "../helpers/test-client";
import { services } from "../../services";
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

afterAll(async () => {
  const classIds = [...ownedClassIds];
  const userIds = [...ownedUserIds];
  if (classIds.length > 0) {
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
    expect(await ledgerHolds(fixture)).toHaveLength(0);
    expect(await enrollmentRows(fixture)).toHaveLength(1);
  });
});
