import { describe, expect, test } from "bun:test";

import {
  GUIDE_CONTENT,
  GUIDE_VIEWS,
  canViewGuide,
  getAllowedGuideViews,
  getDefaultGuideView,
  resolveGuideView,
} from "./guide-content";

describe("guide view access", () => {
  test("limits students to the student journey", () => {
    expect(getAllowedGuideViews("student")).toEqual(["student"]);
    expect(canViewGuide("student", "student")).toBe(true);
    expect(canViewGuide("student", "tutor")).toBe(false);
    expect(canViewGuide("student", "admin")).toBe(false);
  });

  test("lets tutors switch between tutor and student journeys", () => {
    expect(getAllowedGuideViews("tutor")).toEqual(["tutor", "student"]);
    expect(resolveGuideView("tutor", "student")).toBe("student");
    expect(resolveGuideView("tutor", "admin")).toBe("tutor");
  });

  test("lets admins access every journey and defaults to admin", () => {
    expect(getAllowedGuideViews("admin")).toEqual([
      "admin",
      "tutor",
      "student",
    ]);
    expect(getDefaultGuideView("admin")).toBe("admin");
    expect(resolveGuideView("admin", "student")).toBe("student");
  });

  test("falls back to the student journey for unknown roles", () => {
    expect(getDefaultGuideView("unknown")).toBe("student");
    expect(resolveGuideView("unknown", "admin")).toBe("student");
  });
});

describe("guide content", () => {
  test("provides chapters and steps for every supported view", () => {
    for (const view of GUIDE_VIEWS) {
      const content = GUIDE_CONTENT[view];
      const steps = content.chapters.flatMap((chapter) => chapter.steps);

      expect(content.title.length).toBeGreaterThan(0);
      expect(content.chapters.length).toBeGreaterThan(0);
      expect(steps.length).toBeGreaterThan(0);
      expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
    }
  });

  test("uses internal routes for every guide call to action", () => {
    const validRoutes = new Set([
      "/dashboard",
      "/balance",
      "/bookings",
      "/calendar",
      "/achievements",
      "/tutors",
      "/student-resources",
      "/notifications",
      "/onboarding",
      "/availability",
      "/admin",
      "/admin-tutors",
      "/admin-operations",
      "/admin-achievements",
      "/admin-economy",
    ]);

    for (const view of GUIDE_VIEWS) {
      for (const chapter of GUIDE_CONTENT[view].chapters) {
        for (const step of chapter.steps) {
          const ctas = [
            step.cta,
            ...(step.branches ?? []).map((branch) => branch.cta),
          ].filter((cta) => cta !== undefined);

          for (const cta of ctas) {
            expect(validRoutes.has(cta.to)).toBe(true);
          }
        }
      }
    }
  });

  test("surfaces concrete timing rules in bold-copy markers", () => {
    const copy = JSON.stringify(GUIDE_CONTENT);

    expect(copy).toContain("**7 days**");
    expect(copy).toContain("**12-hour**");
    expect(copy).toContain("**H-2 (2 hours before the session)**");
    expect(copy).toContain("**15-minute**");
    expect(copy).toContain("**24-hour**");
    expect(copy).toContain("**5 minutes**");
    expect(copy).toContain("**30 minutes**");
    expect(copy).toContain("**4 hours**");
  });
});
