import { describe, expect, test } from "bun:test";

import {
  getPostLoginDestination,
  readTutorOnboardingStatus,
} from "./post-login-redirect";

describe("getPostLoginDestination", () => {
  test("sends a tutor without a profile to the profile editor", () => {
    expect(getPostLoginDestination({ role: "tutor" })).toBe("/profile");
  });

  test("sends draft and changes-requested tutors to the profile editor", () => {
    expect(
      getPostLoginDestination({
        role: "tutor",
        tutorOnboardingStatus: "draft",
      }),
    ).toBe("/profile");
    expect(
      getPostLoginDestination({
        role: "tutor",
        tutorOnboardingStatus: "changes_requested",
      }),
    ).toBe("/profile");
  });

  test("sends tutors who have moved past onboarding to the dashboard", () => {
    for (const tutorOnboardingStatus of [
      "pending_review",
      "approved_unpublished",
      "published",
      "suspended",
    ]) {
      expect(
        getPostLoginDestination({ role: "tutor", tutorOnboardingStatus }),
      ).toBe("/dashboard");
    }
  });

  test("sends admins and students to the dashboard by default", () => {
    expect(getPostLoginDestination({ role: "admin" })).toBe("/dashboard");
    expect(getPostLoginDestination({ role: "student" })).toBe("/dashboard");
  });

  test("keeps a validated explicit return path", () => {
    expect(
      getPostLoginDestination({
        role: "admin",
        redirectPath: "/admin-operations",
      }),
    ).toBe("/admin-operations");
  });
});

describe("readTutorOnboardingStatus", () => {
  test("returns the profile status", async () => {
    await expect(
      readTutorOnboardingStatus(async () => ({
        onboardingStatus: "published",
      })),
    ).resolves.toBe("published");
  });

  test("falls back to an unknown status when the profile read fails", async () => {
    await expect(
      readTutorOnboardingStatus(async () => {
        throw new Error("profile unavailable");
      }),
    ).resolves.toBeUndefined();
  });
});
