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
  lateCounts: unknown[] = [],
  meetingOverrides: Record<string, unknown> = {},
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
      if (columns?.count) return query(lateCounts);
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
    insert: () => ({
      values: () => ({ returning: async () => [{ id: published.id }] }),
    }),
    delete: () => ({ where: async () => [] }),
  };
  const audit = { record: mock(async (_entry: unknown) => undefined) };
  const meeting = {
    createMeeting: mock(async () => undefined),
    ...meetingOverrides,
  };
  const service = createAcademyClassService({
    db,
    audit,
    meeting,
    notification: { write: mock(async () => undefined) },
  } as unknown as Parameters<typeof createAcademyClassService>[0]);
  return { service, audit, meeting, selects, records, updates };
}

describe("tutor absence and replacement boundaries", () => {
  const session = {
    id: "session-1",
    classId: "class-1",
    tutorId: "tutor-1",
    version: 2,
    state: "scheduled",
    startAt: new Date("2040-01-01T00:00:00Z"),
    titleEn: "Session",
    mode: "online",
    capacity: 4,
  };
  const absenceInput = {
    sessionId: session.id,
    reason: "Ill",
    requestKey: "req-1",
  };
  const baseClass = { id: "class-1", state: "published", titleEn: "Class" };

  test.each([
    ["missing identity", [[]], []],
    ["missing class", [[{ classId: "class-1" }], [], [session]], []],
    ["missing session", [[{ classId: "class-1" }], [baseClass], []], []],
    [
      "wrong tutor",
      [
        [{ classId: "class-1" }],
        [baseClass],
        [{ ...session, tutorId: "other" }],
      ],
      [],
    ],
  ])("absence report rejects %s", async (_name, selects) => {
    const f = fixture(selects as unknown[][]);
    await expect(
      f.service.reportTutorAbsence("tutor-1", absenceInput),
    ).rejects.toMatchObject({
      code:
        _name === "missing class"
          ? "ACADEMY_CLASS_INVALID_OPERATION"
          : "ACADEMY_CLASS_NOT_FOUND",
    });
  });

  test.each([
    ["class state", { ...baseClass, state: "draft" }, session],
    ["session state", baseClass, { ...session, state: "completed" }],
  ])("absence report rejects invalid %s", async (_name, record, row) => {
    const f = fixture([[{ classId: "class-1" }], [record], [row]]);
    await expect(
      f.service.reportTutorAbsence("tutor-1", absenceInput),
    ).rejects.toMatchObject({ code: "ACADEMY_CLASS_INVALID_OPERATION" });
  });

  test.each(["changed-content", "matching-retry"] as const)(
    "absence request key %s",
    async (scenario) => {
      const prior = {
        ...absenceInput,
        tutorId: "tutor-1",
        assignmentVersion: 2,
        ...(scenario === "changed-content" ? { reason: "Other" } : {}),
        id: "notice-1",
      };
      const f = fixture([
        [{ classId: "class-1" }],
        [baseClass],
        [session],
        [prior],
      ]);
      if (scenario === "matching-retry")
        await expect(
          f.service.reportTutorAbsence("tutor-1", absenceInput),
        ).resolves.toEqual(prior);
      else
        await expect(
          f.service.reportTutorAbsence("tutor-1", absenceInput),
        ).rejects.toBeInstanceOf(AcademyClassStateConflictError);
    },
  );

  test("absence collision for a different request key conflicts", async () => {
    const existing = {
      tutorId: "tutor-1",
      assignmentVersion: 2,
      requestKey: "old",
      reason: "Ill",
    };
    const f = fixture([
      [{ classId: "class-1" }],
      [baseClass],
      [session],
      [],
      [existing],
    ]);
    await expect(
      f.service.reportTutorAbsence("tutor-1", absenceInput),
    ).rejects.toBeInstanceOf(AcademyClassStateConflictError);
  });

  test.each([
    ["missing identity", [[]], []],
    ["missing class", [[{ classId: "class-1" }], [], [session]], []],
    ["missing session", [[{ classId: "class-1" }], [baseClass], []], []],
    [
      "class state",
      [
        [{ classId: "class-1" }],
        [{ ...baseClass, state: "completed" }],
        [session],
      ],
      [],
    ],
    [
      "session state",
      [
        [{ classId: "class-1" }],
        [baseClass],
        [{ ...session, state: "completed" }],
      ],
      [],
    ],
    [
      "version",
      [[{ classId: "class-1" }], [baseClass], [session]],
      { expectedVersion: 1 },
    ],
    [
      "same tutor",
      [[{ classId: "class-1" }], [baseClass], [session], []],
      { replacementTutorId: "tutor-1" },
    ],
    [
      "existing report",
      [
        [{ classId: "class-1" }],
        [baseClass],
        [session],
        [],
        [{ id: "report" }],
        [],
      ],
      {},
    ],
  ] as const)("replacement rejects %s", async (name, selects, override) => {
    const f = fixture(selects as unknown[][]);
    await expect(
      f.service.replaceAbsentTutor("admin-1", {
        sessionId: session.id,
        expectedVersion: 2,
        replacementTutorId: "tutor-2",
        reason: "Coverage",
        ...(override as object),
      }),
    ).rejects.toMatchObject({
      code: name.startsWith("missing")
        ? "ACADEMY_CLASS_NOT_FOUND"
        : name === "same tutor"
          ? "ACADEMY_CLASS_INVALID_OPERATION"
          : "ACADEMY_CLASS_STATE_CONFLICT",
    });
    expect(f.updates).toEqual([]);
  });
});

describe("academy class service reads and meeting recovery", () => {
  test.each([
    "lost-claim",
    "missing-attempt",
    "draft-class",
    "missing-create",
    "missing-update",
    "missing-cancel",
    "manual-result",
    "blank-link",
    "primitive-update-error",
    "primitive-update-no-link",
  ] as const)("meeting dispatch handles %s", async (scenario) => {
    const updating =
      scenario === "missing-update" || scenario.startsWith("primitive-update");
    const attempt = {
      meeting: {
        provider: "google_meet",
        externalEventId:
          updating || scenario === "missing-cancel" ? "event1" : null,
        scheduleVersion: 1,
        meetingUrl:
          scenario === "primitive-update-no-link"
            ? null
            : "https://meet.example/link",
        creationGeneration: 1,
      },
      session: {
        id: "session1",
        state: scenario === "missing-cancel" ? "cancelled" : "scheduled",
        version: updating ? 2 : 1,
        startAt: new Date(),
        endAt: new Date(),
        titleEn: "Session",
      },
      academyClass: {
        state: scenario === "draft-class" ? "draft" : "published",
        titleEn: "Class",
      },
      tutorName: "Tutor",
      tutorEmail: "tutor@example.test",
    };
    const providers = scenario.startsWith("primitive-update")
      ? {
          updateAcademyClassEvent: mock(async () => {
            throw "provider unavailable";
          }),
        }
      : scenario === "manual-result" || scenario === "blank-link"
        ? {
            createAcademyClassEvent: mock(async () => ({
              provider: scenario === "manual-result" ? "manual" : "google_meet",
              status: "created",
              externalEventId: "event1",
              meetingUrl:
                scenario === "blank-link" ? " " : "https://meet.example/link",
              errorReason: null,
            })),
          }
        : {};
    const f = fixture(
      [
        [{ id: "meeting1" }],
        [],
        [],
        scenario === "missing-attempt" ? [] : [attempt],
      ],
      [],
      [],
      [
        scenario === "lost-claim"
          ? []
          : [{ scheduleVersion: 1, attemptCount: 1, lockedAt: new Date() }],
        [{ status: "failed" }],
      ],
      undefined,
      [],
      providers,
    );
    const result = await f.service.processReadyMeetings();
    expect(result).toEqual({
      processed: scenario === "lost-claim" ? 0 : 1,
      created: 0,
      failed: scenario === "lost-claim" ? 0 : 1,
      cancelled: 0,
    });
    if (scenario !== "lost-claim")
      expect(f.updates.at(-1)).toMatchObject({
        errorReason: expect.any(String),
      });
  });
  test.each([
    "missing-identity",
    "missing-class",
    "missing-session",
    "draft",
    "completed",
    "version",
    "past-start",
    "bad-end",
    "same-time",
    "free-exit",
    "minimum-check",
    "reported",
    "earned",
    "started",
    "tutor-booking",
    "tutor-class",
    "room-missing",
    "room-small",
    "room-booking",
    "room-class",
    "lost-update",
  ] as const)("reschedule rejects %s", async (scenario) => {
    const oldStart = new Date(Date.now() + 24 * 3600000);
    const startAt = new Date(Date.now() + 48 * 3600000);
    const endAt = new Date(startAt.getTime() + 3600000);
    const row = {
      id: "session1",
      classId: "class1",
      tutorId: "tutor1",
      titleEn: "Session",
      version: 1,
      state: scenario === "completed" ? "completed" : "scheduled",
      sequenceNumber: 1,
      startAt: scenario === "started" ? new Date(0) : oldStart,
      endAt: new Date(oldStart.getTime() + 3600000),
      roomId: scenario.startsWith("room-") ? "room1" : null,
      capacity: 4,
    };
    const record = {
      id: "class1",
      state: scenario === "draft" ? "draft" : "published",
      kind: "cohort",
      freeExitUntil:
        scenario === "free-exit" ? new Date(startAt.getTime() + 3600000) : null,
      minimumCheckAt:
        scenario === "minimum-check"
          ? new Date(startAt.getTime() + 3600000)
          : null,
    };
    const selections = [
      scenario === "missing-identity" ? [] : [{ classId: "class1" }],
      scenario === "missing-class" ? [] : [record],
      scenario === "missing-session" ? [] : [row],
      [{ ...row, id: "session2", sequenceNumber: 2 }, row],
      scenario === "reported" ? [{ id: "report" }] : [],
      scenario === "earned" ? [{ id: "fee" }] : [],
      scenario === "tutor-booking" ? [{ id: "booking" }] : [],
      scenario === "tutor-class" ? [{ id: "class-session" }] : [],
    ];
    if (scenario.startsWith("room-"))
      selections.push(
        scenario === "room-missing"
          ? []
          : [{ id: "room1", capacity: scenario === "room-small" ? 1 : 4 }],
        scenario === "room-booking" ? [{ id: "booking" }] : [],
        scenario === "room-class" ? [{ id: "class-session" }] : [],
      );
    const f = fixture(selections);
    const input = {
      sessionId: row.id,
      expectedVersion: scenario === "version" ? 2 : 1,
      startAt:
        scenario === "past-start"
          ? new Date(0)
          : scenario === "same-time"
            ? row.startAt
            : startAt,
      endAt:
        scenario === "bad-end"
          ? startAt
          : scenario === "same-time"
            ? row.endAt
            : endAt,
      reason: "Schedule update",
    };
    const code = scenario.startsWith("missing-")
      ? "ACADEMY_CLASS_NOT_FOUND"
      : [
            "draft",
            "completed",
            "version",
            "reported",
            "earned",
            "started",
            "lost-update",
          ].includes(scenario)
        ? "ACADEMY_CLASS_STATE_CONFLICT"
        : "ACADEMY_CLASS_INVALID_OPERATION";
    await expect(
      f.service.rescheduleSession("admin1", input),
    ).rejects.toMatchObject({ code });
    expect(f.audit.record).not.toHaveBeenCalled();
  });
  test("admin list matches absence notices to current assignment and counts late history", async () => {
    const current = { id: "current", tutorId: "tutor-a", assignmentVersion: 2 };
    const prior = { id: "prior", tutorId: "tutor-a", assignmentVersion: 1 };
    const other = { id: "other", tutorId: "tutor-b", assignmentVersion: 2 };
    const uncounted = {
      id: "uncounted",
      tutorId: "tutor-c",
      assignmentVersion: 1,
    };
    const record = {
      ...published,
      sessions: [
        {
          id: "s1",
          tutorId: "tutor-a",
          version: 2,
          tutorAbsences: [other, prior, current],
        },
        {
          id: "s2",
          tutorId: "tutor-c",
          version: 1,
          tutorAbsences: [uncounted],
        },
        { id: "s3", tutorId: "tutor-d", version: 1, tutorAbsences: [] },
      ],
    };
    const f = fixture([], [], [[record]], [], undefined, [
      { tutorId: "tutor-a", count: 3 },
    ]);
    const rows = await f.service.list({});
    expect(rows[0]?.sessions[0]?.tutorAbsence).toEqual({
      ...current,
      tutorLateNoticeCount: 3,
    });
    expect(rows[0]?.sessions[0]?.tutorAbsences).toEqual([
      { ...other, tutorLateNoticeCount: 0 },
      { ...prior, tutorLateNoticeCount: 3 },
      { ...current, tutorLateNoticeCount: 3 },
    ]);
    expect(rows[0]?.sessions[1]?.tutorAbsence).toEqual({
      ...uncounted,
      tutorLateNoticeCount: 0,
    });
    expect(rows[0]?.sessions[2]?.tutorAbsence).toBeNull();
  });
  test("getPublished returns published catalog records and hides drafts", async () => {
    const f = fixture([], [published]);
    await expect(f.service.getPublished("class-1")).resolves.toMatchObject({
      id: "class-1",
      state: "published",
      titleEn: "Class",
    });

    const draft = fixture([], [{ ...published, state: "draft" }]);
    await expect(draft.service.getPublished("class-1")).rejects.toBeInstanceOf(
      AcademyClassNotFoundError,
    );
  });

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
    "missing-room-id",
    "new-session-id",
  ] as const)("draft validation rejects %s before writes", async (scenario) => {
    const inPerson =
      scenario === "missing-room" ||
      scenario === "room-capacity" ||
      scenario === "missing-room-id";
    const session = {
      id: scenario === "new-session-id" ? "existing-session" : undefined,
      startAt: new Date("2040-01-01T00:00:00Z"),
      endAt: new Date("2040-01-01T01:00:00Z"),
      curriculumEn: scenario === "curriculum" ? " " : "Problem solving",
      capacity: 4,
      tutorId: "tutor1",
      mode: inPerson ? "in_person" : "online",
      roomId: inPerson && scenario !== "missing-room-id" ? "room1" : null,
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
      "missing-room-id": "Select an active room for every in-person session",
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
    "missing-room-id",
    "overlapping-sessions",
    "room-booking-overlap",
    "room-class-overlap",
    "tutor-booking-overlap",
    "tutor-class-overlap",
    "inactive-specialization",
    "zero-fee",
  ] as const)(
    "publication validates locked reference data: %s",
    async (scenario) => {
      const inPerson =
        scenario === "missing-room" ||
        scenario === "missing-room-id" ||
        scenario.startsWith("room-");
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
        roomId:
          (inPerson || scenario === "online-room") &&
          scenario !== "missing-room-id"
            ? "room1"
            : null,
        tutorFeeIdr:
          scenario === "zero-fee"
            ? 0
            : scenario === "fee-mismatch"
              ? 300000
              : 400000,
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
      const f = fixture(
        selects,
        [
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
        ],
        [],
        [],
        scenario === "inactive-specialization"
          ? {
              id: "competition1",
              isActive: true,
              parentId: "parent1",
              parent: { isActive: false },
            }
          : undefined,
      );
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
          "zero-fee":
            "Every session must use the class's approved flat tutor fee",
          "inactive-specialization":
            "The assigned competition or specialization is archived",
          "past-session":
            "Sessions must start in the future when the class is published",
          "online-room": "Online sessions cannot be assigned an in-person room",
          "missing-room":
            "Select an active managed room for every in-person session",
          "missing-room-id":
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

  test("published catalog maps optional public fields and session order", async () => {
    const base = {
      ...published,
      competition: {
        name: "Competition",
        parent: {
          name: "Parent",
          lightTextColor: "#111",
          lightBackgroundColor: "#eee",
          darkTextColor: "#fff",
          darkBackgroundColor: "#222",
        },
        lightTextColor: "#111",
        lightBackgroundColor: "#eee",
        darkTextColor: "#fff",
        darkBackgroundColor: "#222",
      },
      sessions: [
        {
          id: "session-2",
          sequenceNumber: 2,
          startAt: new Date("2026-11-02"),
          titleEn: "Second",
          curriculumEn: null,
          mode: "in_person",
          tutor: null,
        },
        {
          id: "session-1",
          sequenceNumber: 1,
          startAt: new Date("2026-11-01"),
          titleEn: "First",
          curriculumEn: "Topic",
          mode: "online",
          tutor: { name: "Tutor" },
        },
      ],
    };
    const optional = {
      ...base,
      id: "optional",
      createdAt: new Date("2026-10-03"),
      titleId: undefined,
      descriptionId: null,
      coverKey: "cover/key",
      cohortFullRateMarks: null,
      cohortHalfRateMarks: 0,
      cohortSingleRateMarks: null,
      masterclassRateMarks: 15,
      competition: { name: "Solo", parent: null },
      sessions: [],
    };
    const f = fixture([], [], [[base], [optional]]);
    const rows = await f.service.listPublished();
    expect(rows[0]).toMatchObject({
      id: "optional",
      titleId: null,
      descriptionId: null,
      coverKey: "cover/key",
      cohortFullRateMarks: null,
      cohortHalfRateMarks: 0,
      cohortSingleRateMarks: null,
      masterclassRateMarks: 15,
      competition: {
        name: "Solo",
        lightTextColor: null,
        lightBackgroundColor: null,
        darkTextColor: null,
        darkBackgroundColor: null,
        parent: null,
      },
      sessions: [],
    });
    expect(rows[1]).toMatchObject({
      competition: { parent: { name: "Parent", lightTextColor: "#111" } },
      sessions: [
        { id: "session-2", tutor: null, curriculumEn: null },
        { id: "session-1", tutor: { name: "Tutor" }, curriculumEn: "Topic" },
      ],
    });
    expect(rows[1].sessions.map((session) => session.sequenceNumber)).toEqual([
      2, 1,
    ]);
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

describe("publication optimistic-write recovery", () => {
  test.each([false, true])(
    "failed versioned write rereads existence: %s",
    async (exists) => {
      const session = {
        id: "session1",
        tutorId: "tutor1",
        mode: "online",
        roomId: null,
        startAt: new Date("2040-01-01T00:00:00Z"),
        endAt: new Date("2040-01-01T01:00:00Z"),
        curriculumEn: "Topic",
        capacity: 4,
        tutorFeeIdr: 400000,
      };
      const record = {
        ...published,
        competitionId: "competition1",
        state: "draft",
        version: 1,
        minimumCheckAt: new Date("2039-12-31"),
        minimumEnrollment: 1,
        sessions: [session],
      };
      const f = fixture(
        [
          [{ id: record.id }],
          [{ id: "competition1", parentId: null }],
          [{ id: "competition1" }],
          [
            {
              userId: "tutor1",
              role: "tutor",
              onboardingStatus: "published",
              modality: "both",
            },
          ],
          [],
          [],
        ],
        [record, exists ? { ...record, version: 2 } : null],
      );
      await expect(
        f.service.publish("admin1", {
          id: record.id,
          expectedVersion: 1,
          reason: "Publish",
        }),
      ).rejects.toMatchObject({
        code: exists
          ? "ACADEMY_CLASS_VERSION_CONFLICT"
          : "ACADEMY_CLASS_NOT_FOUND",
      });
      expect(f.updates).toHaveLength(1);
      expect(f.audit.record).not.toHaveBeenCalled();
      expect(f.meeting.createMeeting).not.toHaveBeenCalled();
    },
  );
});

describe("replacement tutor reference and write guards", () => {
  test.each([
    "missing-profile",
    "wrong-role",
    "unpublished",
    "unsupported",
    "too-small",
    "booking-overlap",
    "class-overlap",
    "lost-write",
  ] as const)("rejects %s without audit", async (scenario) => {
    const session = {
      id: "session1",
      tutorId: "old",
      version: 2,
      state: "scheduled",
      mode: "in_person",
      capacity: 4,
      startAt: new Date("2040-01-01"),
      endAt: new Date("2040-01-01T01:00:00Z"),
    };
    const profile = {
      userId: "replacement",
      role: scenario === "wrong-role" ? "student" : "tutor",
      onboardingStatus: scenario === "unpublished" ? "draft" : "published",
      modality: scenario === "unsupported" ? "online" : "offline",
      offlineMaxClassSize: scenario === "too-small" ? 3 : 5,
    };
    const f = fixture([
      [{ classId: "class1" }],
      [{ id: "class1", state: "published" }],
      [session],
      [],
      [],
      [],
      scenario === "missing-profile" ? [] : [profile],
      scenario === "booking-overlap" ? [{ id: "booking1" }] : [],
      scenario === "class-overlap" ? [{ id: "session2" }] : [],
    ]);
    await expect(
      f.service.replaceAbsentTutor("admin1", {
        sessionId: session.id,
        expectedVersion: 2,
        replacementTutorId: "replacement",
        reason: "Replacement",
      }),
    ).rejects.toMatchObject({
      code:
        scenario === "lost-write"
          ? "ACADEMY_CLASS_STATE_CONFLICT"
          : "ACADEMY_CLASS_INVALID_OPERATION",
    });
    expect(f.audit.record).not.toHaveBeenCalled();
    expect(f.updates).toHaveLength(scenario === "lost-write" ? 1 : 0);
  });
});

describe("published class dispatch recovery", () => {
  test.each([false, true])(
    "dispatch failure preserves publication and rereads class: %s",
    async (disappears) => {
      const session = {
        id: "session1",
        tutorId: "tutor1",
        mode: "in_person",
        roomId: "room1",
        startAt: new Date("2040-01-01"),
        endAt: new Date("2040-01-01T01:00:00Z"),
        curriculumEn: "Topic",
        capacity: 4,
        tutorFeeIdr: 400000,
      };
      const record = {
        ...published,
        competitionId: "competition1",
        state: "draft",
        version: 1,
        minimumCheckAt: new Date("2039-12-31"),
        minimumEnrollment: 1,
        sessions: [session],
      };
      const after = { ...record, state: "published", version: 2 };
      const f = fixture(
        [
          [{ id: record.id }],
          [{ id: "competition1", parentId: null }],
          [{ id: "competition1" }],
          [
            {
              userId: "tutor1",
              role: "tutor",
              onboardingStatus: "published",
              modality: "offline",
            },
          ],
          [{ id: "room1", capacity: 4 }],
          [],
          [],
          [],
          [],
        ],
        [record, after, disappears ? null : after],
        [],
        [[after], [session]],
      );
      const result = f.service.publish("admin1", {
        id: record.id,
        expectedVersion: 1,
        reason: "Publish reviewed schedule",
      });
      expect(await result).toEqual(after);
      expect(f.audit.record).toHaveBeenCalledTimes(1);
      expect(f.audit.record.mock.calls[0]?.[0]).toMatchObject({
        action: "academy_class.published",
        details: { onlineMeetingCount: 0 },
      });
      expect(f.updates).toHaveLength(2);
    },
  );
});

describe("replacement completion", () => {
  test.each([false, true])(
    "audits absence context and detects missing final class: %s",
    async (reported) => {
      const session = {
        id: "session1",
        tutorId: "old",
        version: 2,
        state: "scheduled",
        mode: "online",
        capacity: 4,
        titleEn: "Session",
        startAt: new Date("2040-01-01"),
        endAt: new Date("2040-01-01T01:00:00Z"),
      };
      const updated = { ...session, tutorId: "replacement", version: 3 };
      const f = fixture(
        [
          [{ classId: "class1" }],
          [{ id: "class1", state: "published", titleEn: "Class" }],
          [session],
          reported ? [{ reportedAt: new Date("2039-12-31") }] : [],
          [],
          [],
          [
            {
              userId: "replacement",
              role: "tutor",
              onboardingStatus: "published",
              modality: "online",
              onlineMaxClassSize: null,
            },
          ],
          [],
          [],
          [{ studentId: "student1" }],
          [],
        ],
        [null],
        [],
        [[updated], []],
      );
      await expect(
        f.service.replaceAbsentTutor("admin1", {
          sessionId: session.id,
          expectedVersion: 2,
          replacementTutorId: "replacement",
          reason: "Replacement",
        }),
      ).rejects.toMatchObject({ code: "ACADEMY_CLASS_NOT_FOUND" });
      expect(f.audit.record).toHaveBeenCalledTimes(1);
      expect(f.audit.record.mock.calls[0]?.[0]).toMatchObject({
        details: {
          absenceReportedAt: reported ? "2039-12-31T00:00:00.000Z" : null,
          sameSchedule: true,
        },
      });
      expect(f.updates).toHaveLength(2);
    },
  );
});

describe("draft post-write lookup", () => {
  test.each([false, true])(
    "a missing final record aborts draft audit: existing=%s",
    async (existing) => {
      const session = {
        id: existing ? "session1" : undefined,
        tutorId: "tutor1",
        mode: "online",
        roomId: null,
        titleEn: "Session",
        startAt: new Date("2040-01-01"),
        endAt: new Date("2040-01-01T01:00:00Z"),
        capacity: 4,
      };
      const before = {
        ...published,
        kind: "masterclass",
        state: "draft",
        version: 1,
      };
      const f = fixture(
        [
          [
            {
              userId: "tutor1",
              role: "tutor",
              onboardingStatus: "published",
              modality: "both",
            },
          ],
          ...(existing ? [[session]] : []),
        ],
        existing ? [before, null] : [null],
        [],
        [[{ id: published.id, version: 2 }], [{ id: "session1" }]],
      );
      await expect(
        f.service.saveDraft("admin1", {
          ...(existing ? { id: published.id, expectedVersion: 1 } : {}),
          kind: "masterclass",
          competitionId: "competition1",
          titleEn: "Class",
          descriptionEn: "Description",
          masterclassRateMarks: 25,
          tutorFeeIdr: 400000,
          sessions: [session],
          reason: "Save reviewed draft",
        } as Parameters<typeof f.service.saveDraft>[1]),
      ).rejects.toMatchObject({ code: "ACADEMY_CLASS_NOT_FOUND" });
      expect(f.audit.record).not.toHaveBeenCalled();
    },
  );
});

test("cancelling a never-created meeting records cancellation without provider work", async () => {
  const f = fixture(
    [
      [{ id: "meeting1" }],
      [],
      [],
      [
        {
          meeting: {
            provider: "google_meet",
            externalEventId: null,
            creationGeneration: 1,
          },
          session: { id: "session1", state: "cancelled" },
          academyClass: { state: "published" },
        },
      ],
    ],
    [],
    [],
    [
      [{ scheduleVersion: 1, attemptCount: 1, lockedAt: new Date() }],
      [{ status: "cancelled" }],
    ],
  );
  expect(await f.service.processReadyMeetings()).toEqual({
    processed: 1,
    created: 0,
    failed: 0,
    cancelled: 1,
  });
  expect(f.meeting.createMeeting).not.toHaveBeenCalled();
});

test("lost meeting-save lease leaves no processed outcome", async () => {
  const f = fixture(
    [[{ id: "meeting1" }], [], [], []],
    [],
    [],
    [[{ scheduleVersion: 1, attemptCount: 1, lockedAt: new Date() }], [], []],
  );
  expect(await f.service.processReadyMeetings()).toEqual({
    processed: 0,
    created: 0,
    failed: 0,
    cancelled: 0,
  });
});

test("publication aborts audit when the final persisted class is absent", async () => {
  const session = {
    id: "session1",
    tutorId: "tutor1",
    mode: "online",
    roomId: null,
    capacity: 4,
    tutorFeeIdr: 400000,
    startAt: new Date("2040-01-01"),
    endAt: new Date("2040-01-01T01:00:00Z"),
  };
  const before = {
    ...published,
    kind: "masterclass",
    state: "draft",
    version: 1,
    competitionId: "competition1",
    sessions: [session],
  };
  const f = fixture(
    [
      [{ id: before.id }],
      [{ id: "competition1", parentId: null }],
      [{ id: "competition1" }],
      [
        {
          userId: "tutor1",
          role: "tutor",
          onboardingStatus: "published",
          modality: "both",
        },
      ],
      [],
      [],
    ],
    [before, null],
    [],
    [[{ id: before.id, version: 2 }], []],
  );
  await expect(
    f.service.publish("admin1", {
      id: before.id,
      expectedVersion: 1,
      reason: "Publish reviewed draft",
    }),
  ).rejects.toMatchObject({ code: "ACADEMY_CLASS_NOT_FOUND" });
  expect(f.audit.record).not.toHaveBeenCalled();
});

test.each([false, true])(
  "rescheduling detects a class removed after session updates, managedRoom=%s",
  async (managedRoom) => {
    const session = {
      id: "session1",
      classId: "class1",
      tutorId: "tutor1",
      version: 1,
      state: "scheduled",
      sequenceNumber: 1,
      titleEn: "Session",
      roomId: managedRoom ? "room1" : null,
      capacity: 4,
      startAt: new Date("2040-01-01"),
      endAt: new Date("2040-01-01T01:00:00Z"),
    };
    const f = fixture(
      [
        [{ classId: "class1" }],
        [
          {
            id: "class1",
            state: "published",
            kind: "cohort",
            freeExitUntil: null,
            minimumCheckAt: null,
          },
        ],
        [session],
        [session],
        [],
        [],
        [],
        [],
        ...(managedRoom ? [[{ id: "room1", capacity: 4 }], [], []] : []),
        [],
      ],
      [null],
      [],
      [[{ ...session, version: 2, scheduleChangeVersion: 2 }], []],
    );
    await expect(
      f.service.rescheduleSession("admin1", {
        sessionId: session.id,
        expectedVersion: 1,
        startAt: new Date("2040-01-02"),
        endAt: new Date("2040-01-02T01:00:00Z"),
        reason: "Move scheduled session",
      }),
    ).rejects.toMatchObject({ code: "ACADEMY_CLASS_NOT_FOUND" });
    expect(f.audit.record).toHaveBeenCalledTimes(1);
  },
);

test("late tutor absence includes a late notice in the audit", async () => {
  const session = {
    id: "session1",
    classId: "class1",
    tutorId: "tutor1",
    version: 2,
    state: "scheduled",
    titleEn: "Session",
    startAt: new Date(0),
  };
  const f = fixture([
    [{ classId: "class1" }],
    [{ id: "class1", state: "published", titleEn: "Class" }],
    [session],
    [],
    [],
    [{ id: "admin1" }],
  ]);
  await expect(
    f.service.reportTutorAbsence("tutor1", {
      sessionId: session.id,
      reason: "Illness",
      requestKey: "absence1",
    }),
  ).resolves.toEqual({ id: published.id });
  expect(f.audit.record).toHaveBeenCalledWith(
    expect.objectContaining({
      details: expect.objectContaining({ late: true }),
    }),
  );
});

test("absence retries reuse an existing assignment notice after the request-key lookup misses", async () => {
  const existing = {
    id: "notice1",
    tutorId: "tutor1",
    requestKey: "request1",
    reason: "Illness",
  };
  const session = {
    id: "session1",
    tutorId: "tutor1",
    version: 2,
    state: "scheduled",
    startAt: new Date("2040-01-01"),
  };
  const f = fixture([
    [{ classId: "class1" }],
    [{ id: "class1", state: "published" }],
    [session],
    [],
    [existing],
  ]);
  expect(
    await f.service.reportTutorAbsence("tutor1", {
      sessionId: session.id,
      requestKey: "request1",
      reason: "Illness",
    }),
  ).toEqual(existing);
  expect(f.audit.record).not.toHaveBeenCalled();
  expect(f.updates).toEqual([]);
});
