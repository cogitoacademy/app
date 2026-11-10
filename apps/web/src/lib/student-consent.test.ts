import { describe, expect, test } from "bun:test";
import { emptyStudentConsent, toStudentConsent } from "./student-consent";

describe("student signup consent", () => {
  test("requires age selection and student agreement", () => {
    expect(toStudentConsent(emptyStudentConsent)).toBeNull();
    expect(
      toStudentConsent({ ...emptyStudentConsent, ageGroup: "adult" }),
    ).toBeNull();
    expect(
      toStudentConsent({
        ...emptyStudentConsent,
        ageGroup: "adult",
        termsAccepted: true,
      }),
    ).toEqual({
      ageGroup: "adult",
      termsAccepted: true,
      termsVersion: "2026-11",
    });
  });

  test("requires the guardian name, relationship and agreement for a minor", () => {
    const minor = {
      ...emptyStudentConsent,
      ageGroup: "minor" as const,
      termsAccepted: true,
    };
    expect(toStudentConsent(minor)).toBeNull();
    expect(
      toStudentConsent({
        ...minor,
        guardianName: "Parent",
        guardianRelationship: "mother",
      }),
    ).toBeNull();
    expect(
      toStudentConsent({
        ...minor,
        guardianName: "  Parent  ",
        guardianRelationship: "mother",
        guardianAccepted: true,
      }),
    ).toEqual({
      ageGroup: "minor",
      termsAccepted: true,
      termsVersion: "2026-11",
      guardianName: "Parent",
      guardianRelationship: "mother",
      guardianAccepted: true,
    });
  });
});
