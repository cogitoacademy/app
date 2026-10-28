import { describe, expect, mock, test } from "bun:test";
import { createAcademyClassService } from "../../modules/academy-class/academy-class.service";
import {
  AcademyClassNotFoundError,
  AcademyClassStateConflictError,
} from "../../modules/academy-class/academy-class.errors";

const published = {
  id: "class-1",
  state: "published",
  kind: "cohort",
  titleEn: "Class",
  descriptionEn: "Description",
  coverKey: null,
  cohortFullRateMarks: 20,
  cohortHalfRateMarks: 22,
  cohortSingleRateMarks: 25,
  masterclassRateMarks: null,
  tutorFeeIdr: 400000,
  competition: { name: "Competition", parent: null },
  sessions: [],
  createdAt: new Date("2026-10-01T00:00:00Z"),
};

function query(rows: unknown[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    for: async () => rows,
    limit: async () => rows,
    // eslint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
    then: (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function fixture(
  selects: unknown[][] = [],
  records: unknown[] = [],
  lists: unknown[][] = [],
  updatedRows: unknown[][] = [],
) {
  const updates: unknown[] = [];
  const db = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    query: {
      academyClass: {
        findFirst: async () => records.shift(),
        findMany: async () => lists.shift() ?? [],
      },
    },
    select: () => {
      const rows = selects.shift();
      if (!rows) throw new Error("Unexpected select");
      return query(rows);
    },
    update: () => ({
      set: (values: unknown) => {
        updates.push(values);
        return {
          where: () => ({ returning: async () => updatedRows.shift() ?? [] }),
        };
      },
    }),
  };
  const audit = { record: mock(async () => undefined) };
  const meeting = { createMeeting: mock(async () => undefined) };
  const service = createAcademyClassService({
    db,
    audit,
    meeting,
    notification: { write: mock(async () => undefined) },
  } as unknown as Parameters<typeof createAcademyClassService>[0]);
  return { service, audit, meeting, selects, records, updates };
}

describe("academy class service reads and meeting recovery", () => {
  test("admin listing retains details while the published catalog merges and sorts public records", async () => {
    const postponed = {
      ...published,
      id: "class-2",
      state: "postponed",
      createdAt: new Date("2026-10-02T00:00:00Z"),
    };
    const f = fixture([], [], [[published], [published], [postponed]]);
    expect(await f.service.list({ state: "published" })).toEqual([published]);
    const catalog = await f.service.listPublished();
    expect(catalog.map((row) => row.id)).toEqual([postponed.id, published.id]);
    expect(catalog[0]).not.toHaveProperty("tutorFeeIdr");
  });

  test.each([
    "missing-lock",
    "missing-record",
    "draft",
    "no-failed-meeting",
  ] as const)(
    "retry rejects %s before audit or provider calls",
    async (scenario) => {
      const selects =
        scenario === "missing-lock"
          ? [[]]
          : scenario === "no-failed-meeting"
            ? [[{ id: published.id }], []]
            : [[{ id: published.id }]];
      const records =
        scenario === "missing-record"
          ? [null]
          : [
              {
                ...published,
                state: scenario === "draft" ? "draft" : "published",
              },
            ];
      const f = fixture(selects, records);
      await expect(
        f.service.retryMeetings("admin-1", {
          id: published.id,
          reason: "Retry meeting setup",
        }),
      ).rejects.toBeInstanceOf(
        scenario.startsWith("missing")
          ? AcademyClassNotFoundError
          : AcademyClassStateConflictError,
      );
      expect(f.audit.record).not.toHaveBeenCalled();
      expect(f.meeting.createMeeting).not.toHaveBeenCalled();
    },
  );

  test.each([false, true])(
    "retry queues failed meetings and detects a disappearing class: %s",
    async (disappeared) => {
      const f = fixture(
        [[{ id: published.id }], [{ id: "meeting-1" }], []],
        [published, disappeared ? null : published],
        [],
        [[{ id: "meeting-1" }]],
      );
      const pending = f.service.retryMeetings("admin-1", {
        id: published.id,
        reason: "Retry meeting setup",
      });
      if (disappeared)
        await expect(pending).rejects.toBeInstanceOf(AcademyClassNotFoundError);
      else await expect(pending).resolves.toEqual(published);
      expect(f.updates).toEqual([
        { status: "pending", nextRetryAt: expect.any(Date), lockedAt: null },
      ]);
      expect(f.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "academy_class.meetings_retry_requested",
          details: { reason: "Retry meeting setup", meetingCount: 1 },
        }),
      );
      expect(f.selects).toEqual([]);
    },
  );

  test("scheduled meeting retry returns no successes or failures when no work is due", async () => {
    const f = fixture([[]]);
    await expect(f.service.retryFailedMeetings()).resolves.toEqual({
      succeeded: 0,
      failed: 0,
    });
    expect(f.meeting.createMeeting).not.toHaveBeenCalled();
  });
});
