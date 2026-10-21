import { describe, expect, test } from "bun:test";
import { toPublicAcademyClass } from "../../modules/academy-class/academy-class.public";

describe("toPublicAcademyClass", () => {
  test("returns the student catalog fields without admin, tutor payout, or roster data", () => {
    const publicRecord = {
      id: "class-1",
      kind: "cohort",
      state: "published",
      titleEn: "Synthetic cohort",
      descriptionEn: "Test catalog description",
      coverKey: null,
      cohortFullRateMarks: 20,
      cohortHalfRateMarks: 22,
      cohortSingleRateMarks: 25,
      masterclassRateMarks: null,
      tutorFeeIdr: 400_000,
      version: 3,
      competition: {
        name: "Synthetic specialization",
        privateNotes: "hidden",
        parent: { name: "Synthetic competition", privateNotes: "hidden" },
      },
      sessions: [
        {
          id: "session-1",
          sequenceNumber: 1,
          startAt: new Date("2026-11-01T03:00:00.000Z"),
          titleEn: "Synthetic session",
          curriculumEn: "Synthetic curriculum",
          mode: "online",
          tutorFeeIdr: 400_000,
          room: { address: "Private venue address" },
          tutor: {
            name: "Synthetic tutor",
            email: "private@example.test",
            bankAccountNumber: "private",
          },
          students: [
            { name: "Private student", email: "student@example.test" },
          ],
        },
      ],
    };

    expect(toPublicAcademyClass(publicRecord)).toEqual({
      id: "class-1",
      kind: "cohort",
      state: "published",
      titleEn: "Synthetic cohort",
      descriptionEn: "Test catalog description",
      coverKey: null,
      cohortFullRateMarks: 20,
      cohortHalfRateMarks: 22,
      cohortSingleRateMarks: 25,
      masterclassRateMarks: null,
      competition: {
        name: "Synthetic specialization",
        parent: { name: "Synthetic competition" },
      },
      sessions: [
        {
          id: "session-1",
          sequenceNumber: 1,
          startAt: new Date("2026-11-01T03:00:00.000Z"),
          titleEn: "Synthetic session",
          curriculumEn: "Synthetic curriculum",
          mode: "online",
          tutor: { name: "Synthetic tutor" },
        },
      ],
    });
  });
});
