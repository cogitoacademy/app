import { describe, expect, test } from "bun:test";

import {
  createTutorProfileAuditSnapshot,
  getChangedTutorProfileAuditFields,
} from "../../modules/tutor/tutor-profile-audit";

describe("tutor profile audit snapshots", () => {
  test("captures complete profile state, image, and specializations", () => {
    const snapshot = createTutorProfileAuditSnapshot({
      shortBio: "Tutor bio",
      bankAccountNumber: "1234567890",
      publishedAt: new Date("2026-09-29T00:00:00.000Z"),
      user: { name: "Tutor", image: "https://example.com/tutor.jpg" },
      subjects: [{ subjectId: "subject-2" }, { subjectId: "subject-1" }],
    });

    expect(snapshot).toMatchObject({
      displayName: "Tutor",
      profileImageUrl: "https://example.com/tutor.jpg",
      subjectIds: ["subject-1", "subject-2"],
      shortBio: "Tutor bio",
      bankAccountNumber: "1234567890",
      publishedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(snapshot).toHaveProperty("achievements", null);
    expect(snapshot).toHaveProperty("experiences", null);
  });

  test("finds nested pending and top-level changes", () => {
    const before = createTutorProfileAuditSnapshot({
      shortBio: "Old bio",
      pendingProfileChanges: { achievements: [] },
    });
    const after = createTutorProfileAuditSnapshot({
      shortBio: "New bio",
      pendingProfileChanges: {
        achievements: [{ competitionName: "Olympiad" }],
      },
    });

    expect(getChangedTutorProfileAuditFields(before, after)).toEqual(
      expect.arrayContaining([
        "shortBio",
        "pendingProfileChanges.achievements",
      ]),
    );
  });
});
