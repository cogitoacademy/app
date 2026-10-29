import { expect, test } from "bun:test";
import { classSessionSettlementAmounts } from "../../modules/class-enrollment/class-enrollment.reports";
import { createClassSessionReportService } from "../../modules/class-enrollment/class-enrollment.reports";
import {
  ClassEnrollmentConflictError,
  ClassEnrollmentInvalidOperationError,
  ClassEnrollmentNotFoundError,
} from "../../modules/class-enrollment/class-enrollment.errors";
import { submitClassSessionReportInput } from "../../modules/class-enrollment/class-enrollment.types";
import { TEST_COMPLETION_FEEDBACK } from "../helpers/completion-feedback";

const reportClass = {
  id: "class-1",
  state: "published",
  kind: "cohort",
  titleEn: "Class",
};
const reportSession = {
  id: "session-1",
  classId: reportClass.id,
  state: "scheduled",
  tutorId: "tutor-1",
  titleEn: "Session",
  startAt: new Date("2039-12-31T10:00:00.000Z"),
  endAt: new Date("2039-12-31T11:00:00.000Z"),
  tutorFeeIdr: 300_000,
};

function reportServiceFixture(
  rows: unknown[][],
  savedReports: unknown[][] = [],
  referralPort?: {
    recordEligibleFirstCompletion: (...args: unknown[]) => void;
  },
) {
  const tx = {
    select: () => {
      const query = {
        from: () => query,
        where: () => query,
        orderBy: () => query,
        for: async () => rows.shift() ?? [],
        limit: async () => rows.shift() ?? [],
        // eslint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
        then: (resolve: (result: unknown[]) => unknown) =>
          Promise.resolve(rows.shift() ?? []).then(resolve),
      };
      return query;
    },
    insert: () => ({
      values: () => ({ returning: async () => savedReports.shift() ?? [] }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  const service = createClassSessionReportService({
    db: {
      transaction: async (callback: (client: unknown) => Promise<unknown>) =>
        callback(tx),
    } as never,
    wallet: { deduct: async () => undefined },
    notification: { write: async () => undefined },
    referralPort,
    clock: () => new Date("2040-01-01T00:00:00.000Z"),
  });
  return service;
}

test("report service validates feedback, actor role, and admin reason before database access", async () => {
  const service = createClassSessionReportService({
    db: {} as never,
    wallet: { deduct: async () => undefined },
    notification: { write: async () => undefined },
  });
  const input = {
    classId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    requestKey: crypto.randomUUID(),
    expectedVersion: 0,
    deliveryConfirmed: true,
    feedback: TEST_COMPLETION_FEEDBACK,
  };

  await expect(
    service.submitSessionReport("admin-1", "admin", {
      ...input,
      feedback: {} as never,
    }),
  ).rejects.toBeInstanceOf(ClassEnrollmentInvalidOperationError);
  await expect(
    service.submitSessionReport("user-1", "student" as never, input),
  ).rejects.toBeInstanceOf(ClassEnrollmentNotFoundError);
  await Promise.all(
    [undefined, "ab", "😀".repeat(501)].map((adminReason) =>
      expect(
        service.submitSessionReport("admin-1", "admin", {
          ...input,
          adminReason,
        }),
      ).rejects.toBeInstanceOf(ClassEnrollmentInvalidOperationError),
    ),
  );
  await expect(
    service.listSessionReports("user-1", "unknown" as never, {}),
  ).rejects.toBeInstanceOf(ClassEnrollmentNotFoundError);
});

test.each([
  "missing-class",
  "missing-session",
  "foreign-session",
  "delivery-unconfirmed",
  "editing-incomplete-session",
  "first-report-nonscheduled-session",
  "session-not-ended",
  "future-cancelled-session",
  "class-state",
  "first-report-version",
  "missing-wallet",
] as const)("report submission rejects %s", async (scenario) => {
  const classRecord =
    scenario === "class-state"
      ? { ...reportClass, state: "draft" }
      : scenario === "future-cancelled-session"
        ? { ...reportClass, state: "cancelled" }
        : reportClass;
  const session =
    scenario === "foreign-session"
      ? { ...reportSession, classId: "another-class" }
      : scenario === "editing-incomplete-session"
        ? { ...reportSession, state: "scheduled" }
        : scenario === "first-report-nonscheduled-session"
          ? { ...reportSession, state: "completed" }
          : scenario === "session-not-ended"
            ? { ...reportSession, endAt: new Date("2040-01-02T00:00:00Z") }
            : scenario === "future-cancelled-session"
              ? {
                  ...reportSession,
                  startAt: new Date("2040-01-02T00:00:00Z"),
                  endAt: new Date("2040-01-01T00:00:00Z"),
                }
              : reportSession;
  const hasReport = scenario === "editing-incomplete-session";
  const hasAllocation = scenario === "missing-wallet";
  const rows: unknown[][] = [];
  if (scenario !== "missing-class") rows.push([classRecord]);
  if (!["missing-class", "missing-session"].includes(scenario))
    rows.push([session]);
  if (hasReport) rows.push([{ id: "report-1", version: 1 }]);
  else rows.push([]);
  if (hasAllocation) {
    rows.push([allocation("allocation-1", "funded", { rate: 10, funded: 10 })]);
    rows.push([]);
  } else {
    rows.push([]);
  }
  if (hasReport) rows.push([]);

  const service = reportServiceFixture(rows);
  const pending = service.submitSessionReport("admin-1", "admin", {
    classId: reportClass.id,
    sessionId: reportSession.id,
    requestKey: crypto.randomUUID(),
    expectedVersion: scenario === "first-report-version" ? 2 : 0,
    deliveryConfirmed: scenario !== "delivery-unconfirmed",
    adminReason: "Correct report",
    feedback: TEST_COMPLETION_FEEDBACK,
  });
  await expect(pending).rejects.toBeInstanceOf(
    ["missing-class", "missing-session", "foreign-session"].includes(scenario)
      ? ClassEnrollmentNotFoundError
      : [
            "delivery-unconfirmed",
            "session-not-ended",
            "future-cancelled-session",
            "class-state",
          ].includes(scenario)
        ? ClassEnrollmentInvalidOperationError
        : ClassEnrollmentConflictError,
  );
});

test("rejects a report insert race when the conditional save returns no row", async () => {
  const service = reportServiceFixture([
    [reportClass],
    [reportSession],
    [],
    [],
  ]);

  await expect(
    service.submitSessionReport("admin-1", "admin", {
      classId: reportClass.id,
      sessionId: reportSession.id,
      requestKey: crypto.randomUUID(),
      expectedVersion: 0,
      deliveryConfirmed: true,
      adminReason: "Report delivered",
      feedback: TEST_COMPLETION_FEEDBACK,
    }),
  ).rejects.toBeInstanceOf(ClassEnrollmentConflictError);
});

test("a first funded report records referral eligibility", async () => {
  const fundedAllocation = allocation("allocation-1", "funded", {
    rate: 10,
    funded: 10,
  });
  const savedReport = {
    id: "report-1",
    sessionId: reportSession.id,
    version: 1,
    discussion: TEST_COMPLETION_FEEDBACK.discussion,
    strengths: TEST_COMPLETION_FEEDBACK.strengths,
    improvements: TEST_COMPLETION_FEEDBACK.improvements,
    createdAt: new Date("2040-01-01T00:00:00.000Z"),
    updatedAt: new Date("2040-01-01T00:00:00.000Z"),
  };
  const referralCalls: unknown[][] = [];
  const service = reportServiceFixture(
    [
      [reportClass],
      [reportSession],
      [],
      [fundedAllocation],
      [{ id: "wallet-1", userId: fundedAllocation.studentId }],
      [{ state: "completed" }],
    ],
    [[savedReport], [], [], []],
    {
      recordEligibleFirstCompletion: async (...args) => {
        referralCalls.push(args);
      },
    },
  );

  const result = await service.submitSessionReport("admin-1", "admin", {
    classId: reportClass.id,
    sessionId: reportSession.id,
    requestKey: crypto.randomUUID(),
    expectedVersion: 0,
    deliveryConfirmed: true,
    adminReason: "Report delivered",
    feedback: TEST_COMPLETION_FEEDBACK,
  });
  expect(result).toMatchObject({ id: savedReport.id, version: 1 });
  expect(referralCalls).toHaveLength(1);
});

test("admin report reasons enforce Unicode character bounds after trimming", () => {
  const input = {
    classId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    requestKey: crypto.randomUUID(),
    expectedVersion: 0,
    deliveryConfirmed: true,
    feedback: TEST_COMPLETION_FEEDBACK,
  };
  expect(
    submitClassSessionReportInput.safeParse({ ...input, adminReason: " ab " })
      .success,
  ).toBe(false);
  expect(
    submitClassSessionReportInput.safeParse({
      ...input,
      adminReason: "😀".repeat(501),
    }).success,
  ).toBe(false);
  expect(
    submitClassSessionReportInput.parse({
      ...input,
      adminReason: ` ${"😀".repeat(500)} `,
    }).adminReason,
  ).toBe("😀".repeat(500));
});

function allocation(
  id: string,
  state: "funded" | "released" | "unfunded_reserved",
  marks: { rate: number; funded: number; spent?: number; released?: number },
) {
  return {
    id,
    studentId: `student-${id}`,
    fundingSourceReference: `source-${id}`,
    state,
    rateMarks: marks.rate,
    fundedMarks: marks.funded,
    spentMarks: marks.spent ?? 0,
    releasedMarks: marks.released ?? 0,
  } as const;
}

test("settlement consumes only the remaining funded allocation balance", () => {
  const plan = classSessionSettlementAmounts([
    allocation("partial", "funded", {
      rate: 22,
      funded: 22,
      spent: 5,
      released: 3,
    }),
    allocation("fully-spent", "funded", {
      rate: 25,
      funded: 25,
      spent: 25,
    }),
    allocation("released", "released", {
      rate: 20,
      funded: 20,
      released: 20,
    }),
    allocation("unfunded", "unfunded_reserved", { rate: 20, funded: 0 }),
  ]);

  expect(plan.map(({ allocation: row, amount }) => [row.id, amount])).toEqual([
    ["partial", 14],
  ]);
});

test("zero residual funded seats do not make a session chargeable", () => {
  expect(
    classSessionSettlementAmounts([
      allocation("spent", "funded", { rate: 25, funded: 25, spent: 25 }),
      allocation("released", "released", {
        rate: 25,
        funded: 25,
        released: 25,
      }),
    ]),
  ).toEqual([]);
});
