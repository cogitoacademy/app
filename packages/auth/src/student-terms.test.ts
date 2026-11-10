import { describe, expect, test } from "bun:test";
import {
  studentTermsConsentSchema,
  studentTermsAcceptanceValues,
} from "./student-terms";

describe("student terms consent", () => {
  test("rejects missing consent and incomplete guardian approval", () => {
    expect(studentTermsConsentSchema.safeParse(undefined).success).toBe(false);
    expect(
      studentTermsConsentSchema.safeParse({
        termsAccepted: true,
        termsVersion: "2026-09",
        ageGroup: "adult",
      }).success,
    ).toBe(false);
    expect(
      studentTermsConsentSchema.safeParse({
        termsAccepted: true,
        termsVersion: "2026-11",
        ageGroup: "minor",
        guardianName: "Parent",
        guardianRelationship: "mother",
      }).success,
    ).toBe(false);
    expect(
      studentTermsConsentSchema.safeParse({
        termsAccepted: true,
        termsVersion: "2026-11",
        ageGroup: "minor",
        guardianName: "  ",
        guardianRelationship: "mother",
        guardianAccepted: true,
      }).success,
    ).toBe(false);
  });
  test("stores the exact accepted version and normalized guardian details", () => {
    const consent = studentTermsConsentSchema.parse({
      termsAccepted: true,
      termsVersion: "2026-11",
      ageGroup: "minor",
      guardianName: "  Jane  ",
      guardianRelationship: "mother",
      guardianAccepted: true,
    });
    expect(studentTermsAcceptanceValues("u", consent)).toEqual({
      userId: "u",
      version: "2026-11",
      ageGroup: "minor",
      guardianName: "Jane",
      guardianRelationship: "mother",
    });
    expect(
      studentTermsAcceptanceValues(
        "u",
        studentTermsConsentSchema.parse({
          termsAccepted: true,
          termsVersion: "2026-11",
          ageGroup: "adult",
        }),
      ),
    ).toMatchObject({ guardianName: null, guardianRelationship: null });
  });
});
