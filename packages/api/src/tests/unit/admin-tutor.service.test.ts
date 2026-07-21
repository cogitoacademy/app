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
    test("returns profile for valid action with profile", () => {
      const result = validateReviewAction(
        "publish",
        makeProfile({ onboardingStatus: "approved_unpublished" }),
      );
      expect(result.profile.onboardingStatus).toBe("approved_unpublished");
    });

    test("throws for null profile", () => {
      expect(() => validateReviewAction("publish", null)).toThrow();
    });

    const actions: ReviewAction[] = [
      "request_changes",
      "approve_unpublished",
      "publish",
      "unpublish",
      "suspend",
    ];
    for (const action of actions) {
      test(`returns profile for action: ${action}`, () => {
        const result = validateReviewAction(action, makeProfile());
        expect(result.profile.onboardingStatus).toBe("pending_review");
      });
    }

    test("throws for invalid action string", () => {
      expect(() =>
        validateReviewAction("invalid_action" as ReviewAction, makeProfile()),
      ).toThrow();
    });
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

    test("buildReviewUpdates throws for invalid action", () => {
      expect(() =>
        buildReviewUpdates("invalid_action" as ReviewAction),
      ).toThrow("Invalid action");
    });
  });
});
