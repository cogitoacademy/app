import { expect, mock, test } from "bun:test";
import {
  academyClass,
  academyClassSession,
  academyClassSessionReport,
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
  ]);
  const tx = {
    select: () => {
      let rows: unknown[] = [];
      const query = {
        from: (table: object) => {
          rows = results.get(table) ?? [];
          return query;
        },
        where: () => query,
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
    wallet: { release: mock(async () => undefined) } as never,
    notification: { write: mock(async () => undefined) } as never,
    clock: () => now,
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
