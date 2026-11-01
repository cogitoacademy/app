import { expect, test } from "bun:test";

import { saveAcademyClassDraftInput } from "../../modules/academy-class/academy-class.types";

function validDraft() {
  return {
    kind: "cohort" as const,
    competitionId: "competition-1",
    titleEn: "Class title",
    descriptionEn: "Class description",
    tutorFeeIdr: 100_000,
    reason: "Initial draft",
    minimumEnrollment: 1,
    minimumCheckAt: "2026-10-30T10:00:00.000Z",
    fullRateMarks: 100,
    halfRateMarks: 50,
    singleRateMarks: 25,
    sessions: [
      {
        capacity: 10,
        titleEn: "Session title",
        startAt: "2026-10-30T10:00:00.000Z",
        endAt: "2026-10-30T11:00:00.000Z",
        mode: "online" as const,
        tutorId: "tutor-1",
      },
    ],
  };
}

test("validates draft version and session scheduling invariants", () => {
  const updateWithoutVersion = saveAcademyClassDraftInput.safeParse({
    ...validDraft(),
    id: "a0f14d1a-1832-43be-a7a3-9dd732595c0b",
  });
  expect(updateWithoutVersion.success).toBe(false);
  if (!updateWithoutVersion.success) {
    expect(updateWithoutVersion.error.issues).toContainEqual(
      expect.objectContaining({
        path: ["expectedVersion"],
        message: "Expected version is required when updating a class draft",
      }),
    );
  }

  const createWithVersion = saveAcademyClassDraftInput.safeParse({
    ...validDraft(),
    expectedVersion: 1,
  });
  expect(createWithVersion.success).toBe(false);
  if (!createWithVersion.success) {
    expect(createWithVersion.error.issues).toContainEqual(
      expect.objectContaining({
        path: ["expectedVersion"],
        message: "Expected version is only valid when updating a class draft",
      }),
    );
  }

  const invalidSessions = saveAcademyClassDraftInput.safeParse({
    ...validDraft(),
    sessions: [
      {
        ...validDraft().sessions[0],
        endAt: "2026-10-30T10:00:00.000Z",
        roomId: "room-1",
      },
      {
        ...validDraft().sessions[0],
        mode: "in_person",
        roomId: null,
      },
    ],
  });
  expect(invalidSessions.success).toBe(false);
  if (!invalidSessions.success) {
    expect(invalidSessions.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Session end time must be after its start time",
        "Online sessions cannot be assigned an in-person room",
        "In-person sessions must select an active room",
      ]),
    );
  }
});
