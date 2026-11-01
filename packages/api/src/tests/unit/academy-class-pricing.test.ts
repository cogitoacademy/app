import { describe, expect, test } from "bun:test";
import { saveAcademyClassDraftInput } from "../../modules/academy-class/academy-class.types";

const common = {
  competitionId: "competition-debate",
  titleEn: "Debate workshop",
  descriptionEn: "Workshop with an agreed tutor fee",
  reason: "Agreed with tutor",
  sessions: [
    {
      capacity: 10,
      titleEn: "Session",
      tutorId: "tutor1",
      mode: "online" as const,
      startAt: new Date("2036-01-01T10:00:00Z"),
      endAt: new Date("2036-01-01T11:00:00Z"),
    },
  ],
};
describe("per-class tutor fee", () => {
  test("accepts custom fees for both class kinds", () => {
    expect(
      saveAcademyClassDraftInput.parse({
        ...common,
        kind: "masterclass",
        masterclassRateMarks: 5,
        tutorFeeIdr: 250_000,
      }).tutorFeeIdr,
    ).toBe(250_000);
    expect(
      saveAcademyClassDraftInput.parse({
        ...common,
        kind: "cohort",
        minimumEnrollment: 2,
        minimumCheckAt: new Date("2035-12-01"),
        fullRateMarks: 20,
        halfRateMarks: 22,
        singleRateMarks: 25,
        tutorFeeIdr: 500_000,
      }).tutorFeeIdr,
    ).toBe(500_000);
  });
  test.each([0, -1, 250000.5, 2_000_000_001, NaN, Infinity])(
    "rejects invalid fee %s",
    (tutorFeeIdr) => {
      expect(
        saveAcademyClassDraftInput.safeParse({
          ...common,
          kind: "masterclass",
          masterclassRateMarks: 5,
          tutorFeeIdr,
        }).success,
      ).toBe(false);
    },
  );
});
