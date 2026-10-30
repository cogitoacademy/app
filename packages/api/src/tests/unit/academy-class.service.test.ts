import { describe, expect, mock, test } from "bun:test";
import { createAcademyClassService } from "../../modules/academy-class/academy-class.service";
import { createAcademyClassHandler } from "../../modules/academy-class/academy-class.handler";
import type { Context } from "../../context";
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
    groupBy: async () => rows,
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
  competition: unknown = {
    id: "competition1",
    parentId: null,
    isActive: true,
  },
) {
  const updates: unknown[] = [];
  const db = {
    execute: async () => undefined,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    query: {
      subjectCategory: {
        findFirst: async () => competition,
      },
      academyClass: {
        findFirst: async () => records.shift(),
        findMany: async () => lists.shift() ?? [],
      },
    },
    select: (columns?: { count?: unknown }) => {
      if (columns?.count) return query([]);
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
    delete: () => ({ where: async () => [] }),
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
  test.each([
    "missing",
    "published",
    "version",
    "duplicate-session",
    "foreign-session",
    "lost-update",
    "deleted-update",
    "session-update-conflict",
  ] as const)("draft editing detects %s", async (scenario) => {
    const session = {
      id: "session1",
      tutorId: "tutor1",
      capacity: 4,
      mode: "online",
      roomId: null,
      startAt: new Date("2040-01-01T00:00:00Z"),
      endAt: new Date("2040-01-01T01:00:00Z"),
      curriculumEn: "Problem solving",
    };
    const before = {
      ...published,
      state: scenario === "published" ? "published" : "draft",
      version: scenario === "version" ? 2 : 1,
    };
    const second = {
      ...session,
      startAt: new Date("2040-01-02T00:00:00Z"),
      endAt: new Date("2040-01-02T01:00:00Z"),
    };
    const f = fixture(
      [
        [
          {
            userId: "tutor1",
            role: "tutor",
            onboardingStatus: "published",
            modality: "both",
            onlineMaxClassSize: 5,
          },
        ],
        scenario === "foreign-session" ? [] : [session],
      ],
      [
        scenario === "missing" ? null : before,
        scenario === "deleted-update" ? null : { ...before, version: 2 },
      ],
      [],
      scenario === "session-update-conflict"
        ? [[{ id: published.id, version: 2 }], []]
        : [],
    );
    await expect(
      f.service.saveDraft("admin1", {
        id: published.id,
        expectedVersion: 1,
        kind: "cohort",
        competitionId: "competition1",
        minimumCheckAt: new Date("2039-12-01T00:00:00Z"),
        minimumEnrollment: 1,
        sessions:
          scenario === "duplicate-session" ? [session, second] : [session],
        reason: "Update reviewed draft",
      } as Parameters<typeof f.service.saveDraft>[1]),
    ).rejects.toMatchObject({
      code:
        scenario === "missing" || scenario === "deleted-update"
          ? "ACADEMY_CLASS_NOT_FOUND"
          : scenario === "published"
            ? "ACADEMY_CLASS_STATE_CONFLICT"
            : scenario === "version" || scenario === "lost-update"
              ? "ACADEMY_CLASS_VERSION_CONFLICT"
              : scenario === "session-update-conflict"
                ? "ACADEMY_CLASS_STATE_CONFLICT"
                : "ACADEMY_CLASS_INVALID_OPERATION",
    });
    expect(f.audit.record).not.toHaveBeenCalled();
    expect(f.updates).toHaveLength(
      scenario === "session-update-conflict"
        ? 3
        : scenario.endsWith("update")
          ? 1
          : 0,
    );
  });

  test.each([
    "inactive-competition",
    "inactive-parent",
    "minimum-date",
    "minimum-capacity",
    "curriculum",
    "overlap",
    "missing-profile",
    "wrong-role",
    "unpublished-profile",
    "mode",
    "missing-room",
    "room-capacity",
    "new-session-id",
  ] as const)("draft validation rejects %s before writes", async (scenario) => {
    const inPerson =
      scenario === "missing-room" || scenario === "room-capacity";
    const session = {
      id: scenario === "new-session-id" ? "existing-session" : undefined,
      startAt: new Date("2040-01-01T00:00:00Z"),
      endAt: new Date("2040-01-01T01:00:00Z"),
      curriculumEn: scenario === "curriculum" ? " " : "Problem solving",
      capacity: 4,
      tutorId: "tutor1",
      mode: inPerson ? "in_person" : "online",
      roomId: inPerson ? "room1" : null,
    };
    const profile = {
      userId: "tutor1",
      role: scenario === "wrong-role" ? "student" : "tutor",
      onboardingStatus:
        scenario === "unpublished-profile" ? "draft" : "published",
      modality: scenario === "mode" ? "offline" : "both",
      onlineMaxClassSize: scenario === "tutor-capacity" ? 3 : 5,
      offlineMaxClassSize: 5,
    };
    const selects: unknown[][] = [
      scenario === "missing-profile" ? [] : [profile],
    ];
    if (inPerson)
      selects.push(
        scenario === "missing-room" ? [] : [{ id: "room1", capacity: 3 }],
      );
    const f = fixture(
      selects,
      [],
      [],
      [],
      scenario === "inactive-competition"
        ? { id: "competition1", parentId: null, isActive: false }
        : scenario === "inactive-parent"
          ? {
              id: "specialization1",
              parentId: "competition1",
              isActive: true,
              parent: { isActive: false },
            }
          : undefined,
    );
    const messages = {
      "inactive-competition": "Select an active competition or specialization",
      "inactive-parent": "Select an active competition or specialization",
      "minimum-date":
        "The minimum-enrollment check must be before the first session",
      "minimum-capacity":
        "Minimum enrollment cannot exceed any session capacity",
      curriculum: "Cohort sessions require an English curriculum description",
      overlap: "Sessions in one class cannot overlap",
      "missing-profile": "Assign a published tutor profile to every session",
      "wrong-role": "Assign a published tutor profile to every session",
      "unpublished-profile":
        "Assign a published tutor profile to every session",
      mode: "The assigned tutor does not support this session mode",
      "tutor-capacity":
        "Session capacity exceeds the tutor's maximum class size",
      "missing-room": "Select an active room for every in-person session",
      "room-capacity": "Session capacity exceeds the selected room's capacity",
      "new-session-id":
        "New class sessions cannot include existing session IDs",
    };
    await expect(
      f.service.saveDraft("admin1", {
        kind: "cohort",
        competitionId: "competition1",
        titleEn: "Class",
        minimumCheckAt:
          scenario === "minimum-date"
            ? session.startAt
            : new Date("2039-12-01T00:00:00Z"),
        minimumEnrollment: scenario === "minimum-capacity" ? 5 : 1,
        sessions:
          scenario === "overlap" ? [session, { ...session }] : [session],
        reason: "Save reviewed draft",
      } as Parameters<typeof f.service.saveDraft>[1]),
    ).rejects.toMatchObject({
      code: "ACADEMY_CLASS_INVALID_OPERATION",
      message: messages[scenario],
    });
    expect(f.updates).toEqual([]);
    expect(f.audit.record).not.toHaveBeenCalled();
  });

  test.each([
    "missing-profile",
    "wrong-role",
    "unpublished-profile",
    "unsupported-mode",
    "fee-mismatch",
    "past-session",
    "online-room",
    "missing-room",
    "room-capacity",
    "overlapping-sessions",
    "room-booking-overlap",
    "room-class-overlap",
    "tutor-booking-overlap",
    "tutor-class-overlap",
  ] as const)(
    "publication validates locked reference data: %s",
    async (scenario) => {
      const inPerson =
        scenario === "missing-room" || scenario.startsWith("room-");
      const session = {
        id: "session1",
        tutorId: "tutor1",
        classId: published.id,
        startAt: new Date(
          scenario === "past-session"
            ? "2020-01-01T00:00:00Z"
            : "2040-01-01T00:00:00Z",
        ),
        endAt: new Date("2040-01-01T01:00:00Z"),
        curriculumEn: "Problem solving",
        capacity: 4,
        mode: inPerson ? "in_person" : "online",
        roomId: inPerson || scenario === "online-room" ? "room1" : null,
        tutorFeeIdr: scenario === "fee-mismatch" ? 300000 : 400000,
      };
      const profile = {
        userId: "tutor1",
        role: scenario === "wrong-role" ? "student" : "tutor",
        onboardingStatus:
          scenario === "unpublished-profile" ? "draft" : "published",
        modality: scenario === "unsupported-mode" ? "offline" : "both",
        onlineMaxClassSize: scenario === "tutor-capacity" ? 3 : 5,
        offlineMaxClassSize: 5,
      };
      const selects: unknown[][] = [
        [{ id: published.id }],
        [{ id: "competition1", parentId: null }],
        [{ id: "competition1" }],
        scenario === "missing-profile" ? [] : [profile],
      ];
      if (inPerson)
        selects.push(
          scenario === "missing-room"
            ? []
            : [{ id: "room1", capacity: scenario === "room-capacity" ? 3 : 5 }],
        );
      if (
        scenario === "room-booking-overlap" ||
        scenario === "room-class-overlap"
      )
        selects.push(
          scenario === "room-booking-overlap" ? [{ id: "booking1" }] : [],
          scenario === "room-class-overlap" ? [{ id: "session2" }] : [],
        );
      if (
        scenario === "tutor-booking-overlap" ||
        scenario === "tutor-class-overlap"
      )
        selects.push(
          scenario === "tutor-booking-overlap" ? [{ id: "booking1" }] : [],
          scenario === "tutor-class-overlap" ? [{ id: "session2" }] : [],
        );
      const f = fixture(selects, [
        {
          ...published,
          state: "draft",
          version: 1,
          minimumCheckAt: new Date(session.startAt.getTime() - 86400000),
          minimumEnrollment: 1,
          sessions:
            scenario === "overlapping-sessions"
              ? [session, { ...session, id: "session2" }]
              : [session],
        },
      ]);
      await expect(
        f.service.publish("admin1", {
          id: published.id,
          expectedVersion: 1,
          reason: "Publish reviewed class",
        }),
      ).rejects.toMatchObject({
        code: "ACADEMY_CLASS_INVALID_OPERATION",
        message: {
          "missing-profile":
            "Assign a published tutor profile to every session before publishing",
          "wrong-role":
            "Assign a published tutor profile to every session before publishing",
          "unpublished-profile":
            "Assign a published tutor profile to every session before publishing",
          "unsupported-mode":
            "The assigned tutor no longer supports this session mode",
          "tutor-capacity":
            "Session capacity exceeds the tutor's maximum class size",
          "fee-mismatch":
            "Every session must use the class's approved flat tutor fee",
          "past-session":
            "Sessions must start in the future when the class is published",
          "online-room": "Online sessions cannot be assigned an in-person room",
          "missing-room":
            "Select an active managed room for every in-person session",
          "room-capacity":
            "Session capacity exceeds the selected room's capacity",
          "overlapping-sessions": "Sessions in one class cannot overlap",
          "room-booking-overlap":
            "The selected managed room is already booked for this session",
          "room-class-overlap":
            "The selected managed room is already booked for this session",
          "tutor-booking-overlap":
            "The assigned tutor is already scheduled during this session",
          "tutor-class-overlap":
            "The assigned tutor is already scheduled during this session",
        }[scenario],
      });
      expect(f.updates).toEqual([]);
      expect(f.audit.record).not.toHaveBeenCalled();
    },
  );

  test("admin handlers expose reads and map a missing meeting-retry target", async () => {
    const f = fixture([[]], [published], [[published]]);
    const handler = createAcademyClassHandler(f.service);
    expect(
      await handler.listAcademyClasses({ input: { state: "published" } }),
    ).toEqual([published]);
    expect(
      await handler.getAcademyClass({ input: { id: published.id } }),
    ).toEqual(published);
    await expect(
      handler.retryAcademyClassMeetings({
        context: { session: { user: { id: "admin1" } } } as unknown as Context,
        input: { id: "missing", reason: "Retry setup" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  test.each([
    "fee",
    "no-sessions",
    "masterclass-count",
    "curriculum",
    "minimum-date",
    "minimum-capacity",
  ] as const)(
    "publication rejects invalid persisted class data: %s",
    async (scenario) => {
      const session = {
        id: "session-1",
        startAt: new Date("2040-01-01T00:00:00Z"),
        endAt: new Date("2040-01-01T01:00:00Z"),
        curriculumEn: "Problem solving",
        capacity: 4,
        tutorId: "tutor-1",
        mode: "online",
        tutorFeeIdr: 400000,
      };
      const record = {
        ...published,
        state: "draft",
        version: 1,
        minimumCheckAt: new Date("2039-12-01T00:00:00Z"),
        minimumEnrollment: 1,
        sessions: [session],
      };
      const patches = {
        fee: { tutorFeeIdr: 0 },
        "no-sessions": { sessions: [] },
        "masterclass-count": {
          kind: "masterclass",
          tutorFeeIdr: 300000,
          sessions: [session, { ...session, id: "session-2" }],
        },
        curriculum: { sessions: [{ ...session, curriculumEn: "  " }] },
        "minimum-date": { minimumCheckAt: session.startAt },
        "minimum-capacity": { minimumEnrollment: 5 },
      };
      const f = fixture(
        [[{ id: published.id }]],
        [{ ...record, ...patches[scenario] }],
      );
      await expect(
        f.service.publish("admin-1", {
          id: published.id,
          expectedVersion: 1,
          reason: "Publish class",
        }),
      ).rejects.toMatchObject({ code: "ACADEMY_CLASS_INVALID_OPERATION" });
      expect(f.updates).toEqual([]);
      expect(f.audit.record).not.toHaveBeenCalled();
    },
  );

  test("read and publication fail when the class disappears", async () => {
    await expect(
      fixture([], [null]).service.get("missing"),
    ).rejects.toBeInstanceOf(AcademyClassNotFoundError);
    await expect(
      fixture([[]]).service.publish("admin-1", {
        id: "missing",
        expectedVersion: 1,
        reason: "Publish class",
      }),
    ).rejects.toBeInstanceOf(AcademyClassNotFoundError);
    await expect(
      fixture([[{ id: "missing" }]], [null]).service.publish("admin-1", {
        id: "missing",
        expectedVersion: 1,
        reason: "Publish class",
      }),
    ).rejects.toBeInstanceOf(AcademyClassNotFoundError);
    await expect(
      fixture(
        [[{ id: published.id }]],
        [{ ...published, version: 1 }],
      ).service.publish("admin-1", {
        id: published.id,
        expectedVersion: 1,
        reason: "Publish class",
      }),
    ).rejects.toBeInstanceOf(AcademyClassStateConflictError);
  });

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
