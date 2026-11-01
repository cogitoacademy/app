import { expect, mock, test } from "bun:test";
import {
  academyClass,
  academyClassSession,
  academyClassSessionReport,
  auditLog,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassEnrollment,
  wallet,
} from "@cogito-app/db/schema";
import { createAdminClassSessionCancellation } from "../../modules/class-enrollment/class-enrollment.admin-session-cancellation";

const classId = "a4bce053-8c86-463f-b3e1-eec8afd22645";
const sessionId = "a8e83d2b-c61e-44a6-ae55-1e85e03752c3";
const now = new Date("2040-01-01T00:00:00.000Z");
const input = {
  classId,
  sessionId,
  expectedClassVersion: 1,
  expectedSessionVersion: 1,
  reason: "Tutor unavailable",
};

function fixture(
  options: {
    classRecord?: Record<string, unknown> | null;
    session?: Record<string, unknown> | null;
    report?: Record<string, unknown> | null;
    receipt?: Record<string, unknown>;
    failedUpdate?: object;
    clock?: () => Date;
    tableRows?: Map<object, unknown[]>;
    missingDueSession?: boolean;
    release?: (tx: unknown, entry: unknown) => Promise<void>;
    defaultClock?: boolean;
  } = {},
) {
  const results = new Map<object, unknown[]>([
    [
      academyClass,
      options.classRecord === null
        ? []
        : [
            options.classRecord ?? {
              id: classId,
              state: "published",
              version: 1,
            },
          ],
    ],
    [
      academyClassSession,
      options.session === null
        ? []
        : [
            options.session ?? {
              id: sessionId,
              classId,
              state: "scheduled",
              version: 1,
              startAt: new Date("2040-01-02T00:00:00.000Z"),
              tutorId: "tutor1",
              sequenceNumber: 1,
            },
          ],
    ],
    [academyClassSessionReport, options.report ? [options.report] : []],
    [auditLog, options.receipt ? [options.receipt] : []],
  ]);
  const tx = {
    update: (table: object) => ({
      set: () => ({
        where: () => {
          const promise = Promise.resolve(undefined);
          return Object.assign(promise, {
            returning: async () =>
              options.failedUpdate === table
                ? []
                : [{ id: sessionId, version: 2 }],
          });
        },
      }),
    }),
    insert: () => ({ values: async () => undefined }),
    select: (projection?: Record<string, unknown>) => {
      let rows: unknown[] = [];
      const query = {
        from: (table: object) => {
          rows =
            options.missingDueSession &&
            table === academyClassSession &&
            projection?.startAt
              ? []
              : (options.tableRows?.get(table) ?? results.get(table) ?? []);
          return query;
        },
        where: () => query,
        orderBy: () => query,
        for: () => Promise.resolve(rows),
        limit: () => Promise.resolve(rows),
        // eslint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      return query;
    },
  };
  const service = createAdminClassSessionCancellation({
    db: {
      transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx),
    } as never,
    wallet: {
      release: options.release ?? mock(async () => undefined),
    } as never,
    notification: { write: mock(async () => undefined) } as never,
    clock: options.defaultClock ? undefined : (options.clock ?? (() => now)),
  });
  return service;
}

test.each([
  "missing-class",
  "unavailable-class",
  "stale-class-version",
  "missing-session",
  "stale-session-version",
  "session-not-upcoming",
  "session-started",
  "session-has-report",
] as const)("session cancellation preview rejects %s", async (scenario) => {
  const service = fixture({
    classRecord:
      scenario === "missing-class"
        ? null
        : {
            id: classId,
            state: scenario === "unavailable-class" ? "draft" : "published",
            version: scenario === "stale-class-version" ? 2 : 1,
          },
    session:
      scenario === "missing-session"
        ? null
        : {
            id: sessionId,
            classId,
            state:
              scenario === "session-not-upcoming" ? "completed" : "scheduled",
            version: scenario === "stale-session-version" ? 2 : 1,
            startAt:
              scenario === "session-not-upcoming"
                ? new Date(now.getTime() - 1)
                : scenario === "session-started"
                  ? now
                  : new Date(now.getTime() + 60_000),
            tutorId: "tutor1",
            sequenceNumber: 1,
          },
    report: scenario === "session-has-report" ? { id: "report1" } : null,
  });

  await expect(service.preview("admin1", input)).rejects.toMatchObject({
    code:
      scenario === "missing-class" || scenario === "missing-session"
        ? "CLASS_ENROLLMENT_NOT_FOUND"
        : scenario === "unavailable-class" ||
            scenario === "session-not-upcoming" ||
            scenario === "session-started"
          ? "CLASS_ENROLLMENT_INVALID_OPERATION"
          : "CLASS_ENROLLMENT_CONFLICT",
  });
});

test("a postponed class can preview cancellation of an upcoming session", async () => {
  const service = fixture({
    classRecord: {
      id: classId,
      state: "postponed",
      version: 1,
    },
  });

  await expect(service.preview("admin1", input)).resolves.toMatchObject({
    classId,
    sessionId,
    feeMarks: 0,
    returnMarks: 0,
    releasedAllocationIds: [],
  });
});

test("confirmation rejects a quote that changed after preview", async () => {
  const service = fixture();
  const quote = await service.preview("admin1", input);

  await expect(
    service.confirm("admin1", {
      ...input,
      requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
      quoteVersion: "f".repeat(64),
    }),
  ).rejects.toMatchObject({
    code: "CLASS_ENROLLMENT_CONFLICT",
    message:
      "Session cancellation amounts or enrollment payments changed; review a fresh quote",
  });
  expect(quote.quoteVersion).not.toBe("f".repeat(64));
});

test.each([academyClassSession, academyClass])(
  "confirmation rejects a lost session or class version update",
  async (failedUpdate) => {
    const service = fixture({ failedUpdate });
    const quote = await service.preview("admin1", input);
    await expect(
      service.confirm("admin1", {
        ...input,
        requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
        quoteVersion: quote.quoteVersion,
      }),
    ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
  },
);

test("confirmation aborts when the session starts during cancellation", async () => {
  let calls = 0;
  const service = fixture({
    clock: () => (++calls <= 2 ? now : new Date("2040-01-02T00:00:00.000Z")),
  });
  const quote = await service.preview("admin1", input);
  await expect(
    service.confirm("admin1", {
      ...input,
      requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
      quoteVersion: quote.quoteVersion,
    }),
  ).rejects.toThrow("session started while cancellation");
});

test("saved cancellation receipt replays and conflicting request terms are rejected", async () => {
  const quote = await fixture().preview("admin1", input);
  const service = fixture({
    receipt: { details: { quote, reason: input.reason } },
  });
  const confirmation = {
    ...input,
    requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
    quoteVersion: quote.quoteVersion,
  };
  await expect(service.confirm("admin1", confirmation)).resolves.toEqual(quote);
  await expect(
    service.confirm("admin1", { ...confirmation, reason: "Different reason" }),
  ).rejects.toThrow("request key was already used");
});

const enrollmentId = "c3793aa8-6c85-488b-9a3e-e71a205a81be";
const allocationId = "f93f3434-879b-4aeb-aee8-2715d2657a24";
const installmentId = "b73ecb4c-50db-4b5f-bdcb-62858c1300e0";

test("funded session cancellation rejects a missing student wallet", async () => {
  const tableRows = new Map<object, unknown[]>([
    [academyClassEnrollment, [{ id: enrollmentId, state: "active" }]],
    [
      academyClassEnrollmentAllocation,
      [
        {
          id: allocationId,
          enrollmentId,
          installmentId,
          sessionId,
          studentId: "student1",
          state: "funded",
          rateMarks: 20,
          fundedMarks: 20,
          spentMarks: 0,
          releasedMarks: 0,
        },
      ],
    ],
    [
      academyClassEnrollmentInstallment,
      [{ id: installmentId, enrollmentId, ordinal: 1, state: "paid" }],
    ],
  ]);
  const service = fixture({ tableRows });
  const quote = await service.preview("admin1", input);
  expect(quote.returnMarks).toBe(20);
  await expect(
    service.confirm("admin1", {
      ...input,
      requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
      quoteVersion: quote.quoteVersion,
    }),
  ).rejects.toThrow("wallet is unavailable");
});

test("pending second installment retains its previous deadline if its next due session is unavailable", async () => {
  const nextSessionId = "eaaf0688-ce8b-4e1a-bce3-4bbc3e3f9519";
  const tableRows = new Map<object, unknown[]>([
    [academyClassEnrollment, [{ id: enrollmentId, state: "active" }]],
    [
      academyClassEnrollmentAllocation,
      [
        {
          id: allocationId,
          enrollmentId,
          installmentId,
          sessionId,
          studentId: "student1",
          ordinal: 1,
          state: "unfunded_reserved",
          fundedMarks: 0,
          spentMarks: 0,
          releasedMarks: 0,
        },
        {
          id: "f6c5d788-842c-4ccd-a6f6-5d90ea45c903",
          enrollmentId,
          installmentId,
          sessionId: nextSessionId,
          studentId: "student1",
          ordinal: 2,
          state: "unfunded_reserved",
          fundedMarks: 0,
          spentMarks: 0,
          releasedMarks: 0,
        },
      ],
    ],
    [
      academyClassEnrollmentInstallment,
      [
        {
          id: installmentId,
          enrollmentId,
          ordinal: 2,
          state: "pending",
          rateMarks: 20,
          amountMarks: 40,
          sessionCount: 2,
          dueSessionId: sessionId,
          dueAt: now,
        },
      ],
    ],
  ]);
  const service = fixture({ tableRows, missingDueSession: true });
  const quote = await service.preview("admin1", input);
  await expect(
    service.confirm("admin1", {
      ...input,
      requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
      quoteVersion: quote.quoteVersion,
    }),
  ).resolves.toMatchObject({
    returnMarks: 0,
    releasedAllocationIds: [allocationId],
  });
});

test("funded cancellation returns the exact unspent allocation to its student wallet", async () => {
  const release = mock(async (_tx: unknown, _entry: unknown) => undefined);
  const tableRows = new Map<object, unknown[]>([
    [academyClassEnrollment, [{ id: enrollmentId, state: "active" }]],
    [
      academyClassEnrollmentAllocation,
      [
        {
          id: allocationId,
          enrollmentId,
          installmentId,
          sessionId,
          studentId: "student1",
          state: "funded",
          rateMarks: 20,
          fundedMarks: 20,
          spentMarks: 4,
          releasedMarks: 1,
          fundingSourceReference: "funding1",
        },
      ],
    ],
    [
      academyClassEnrollmentInstallment,
      [{ id: installmentId, enrollmentId, ordinal: 1, state: "paid" }],
    ],
    [wallet, [{ id: "wallet1", userId: "student1" }]],
  ]);
  const service = fixture({ tableRows, release });
  const quote = await service.preview("admin1", input);
  expect(quote.returnMarks).toBe(15);
  await expect(
    service.confirm("admin1", {
      ...input,
      quoteVersion: quote.quoteVersion,
      requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
    }),
  ).resolves.toMatchObject({ returnMarks: 15 });
  expect(release).toHaveBeenCalledTimes(1);
  expect(release.mock.calls[0]?.[1]).toMatchObject({
    walletId: "wallet1",
    amount: 15,
    actorType: "admin",
    sourceReference: "funding1",
  });
});

test("session preview uses the system clock when no clock is injected", async () => {
  await expect(
    fixture({ defaultClock: true }).preview("admin1", input),
  ).resolves.toMatchObject({ classId, sessionId });
});

test("session confirmation uses the system clock when no clock is injected", async () => {
  const service = fixture({ defaultClock: true });
  const quote = await service.preview("admin1", input);
  await expect(
    service.confirm("admin1", {
      ...input,
      quoteVersion: quote.quoteVersion,
      requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
    }),
  ).resolves.toMatchObject({ classId, sessionId });
});
