import { describe, test, expect } from "bun:test";
import {
  validateReviewAction,
  buildReviewUpdates,
  type ReviewAction,
  type TutorProfileSnapshot,
} from "../../modules/admin-tutor/admin-tutor.service";

function makeProfile(
  overrides: Partial<TutorProfileSnapshot> = {},
): TutorProfileSnapshot {
  return {
    id: "p1",
    onboardingStatus: "pending_review",
    publishedAt: null,
    ...overrides,
  };
}

describe("AdminTutor Service", () => {
  describe("validateReviewAction", () => {
    test("returns ok for valid action with profile", () => {
      const result = validateReviewAction(
        "publish",
        makeProfile({ onboardingStatus: "approved_unpublished" }),
      );
      expect(result.ok).toBe(true);
    });

    test("returns error for null profile", () => {
      const result = validateReviewAction("publish", null);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    const actions: ReviewAction[] = [
      "request_changes",
      "approve_unpublished",
      "publish",
      "unpublish",
      "suspend",
    ];
    for (const action of actions) {
      test(`returns ok for action: ${action}`, () => {
        const result = validateReviewAction(action, makeProfile());
        expect(result.ok).toBe(true);
        if (result.ok)
          expect(result.profile.onboardingStatus).toBe("pending_review");
      });
    }
  });

  describe("buildReviewUpdates", () => {
    test("publish sets publishedAt and status", () => {
      const { updates, newStatus } = buildReviewUpdates("publish");
      expect(newStatus).toBe("published");
      expect(updates.onboardingStatus).toBe("published");
      expect(updates.publishedAt).toBeInstanceOf(Date);
    });

    test("unpublish clears publishedAt", () => {
      const { updates, newStatus } = buildReviewUpdates("unpublish");
      expect(newStatus).toBe("approved_unpublished");
      expect(updates.publishedAt).toBeNull();
    });

    test("suspend clears publishedAt", () => {
      const { updates } = buildReviewUpdates("suspend");
      expect(updates.onboardingStatus).toBe("suspended");
      expect(updates.publishedAt).toBeNull();
    });

    test("request_changes sets adminNote null by default", () => {
      const { updates } = buildReviewUpdates("request_changes");
      expect(updates.onboardingStatus).toBe("changes_requested");
      expect(updates.adminReviewNote).toBeNull();
    });

    test("approve_unpublished sets adminNote from param", () => {
      const { updates } = buildReviewUpdates(
        "approve_unpublished",
        "looks good",
      );
      expect(updates.adminReviewNote).toBe("looks good");
    });
  });
});
