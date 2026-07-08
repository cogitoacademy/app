import { describe, test, expect } from "bun:test";
import { validateClaim } from "../../modules/invite/invite.service";
import type { tutorInvite, tutorProfile } from "@cogito-app/db/schema";

type InviteRow = typeof tutorInvite.$inferSelect;
type TutorProfileRow = typeof tutorProfile.$inferSelect;

function makeInvite(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    id: "inv1",
    email: "tutor@example.com",
    displayName: "Tutor",
    token: "tok1",
    status: "invited",
    invitedBy: "admin1",
    internalNotes: null,
    expiresAt: new Date(),
    acceptedBy: null,
    acceptedAt: null,
    revokedBy: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as InviteRow;
}

describe("Invite Service", () => {
  describe("validateClaim", () => {
    test("returns ok for valid invite with matching email", () => {
      const result = validateClaim(
        makeInvite({ email: "tutor@example.com" }),
        "tutor@example.com",
        undefined,
      );
      expect(result.ok).toBe(true);
    });

    test("returns ok with case-insensitive email matching", () => {
      const result = validateClaim(
        makeInvite({ email: "Tutor@Example.COM" }),
        "tutor@example.com",
        undefined,
      );
      expect(result.ok).toBe(true);
    });

    test("returns error for null invite", () => {
      const result = validateClaim(undefined, "tutor@example.com", undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    test("returns error when email does not match", () => {
      const result = validateClaim(
        makeInvite({ email: "other@example.com" }),
        "tutor@example.com",
        undefined,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    });

    test("returns error when user already has tutor profile", () => {
      const profile = { id: "tp1" } as TutorProfileRow;
      const result = validateClaim(
        makeInvite({ email: "tutor@example.com" }),
        "tutor@example.com",
        profile,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CONFLICT");
    });
  });
});
