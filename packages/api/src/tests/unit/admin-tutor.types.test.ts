import { describe, test, expect } from "bun:test";
import {
  createInviteInput,
  listInvitesInput,
  resendInviteInput,
  revokeInviteInput,
  reviewTutorProfileInput,
} from "../../modules/admin-tutor/admin-tutor.types";

describe("AdminTutor Types (Zod schemas)", () => {
  test("createInviteInput validates email", () => {
    expect(
      createInviteInput.safeParse({
        email: "test@example.com",
        displayName: "Test",
      }).success,
    ).toBe(true);
    expect(
      createInviteInput.safeParse({ email: "invalid", displayName: "Test" })
        .success,
    ).toBe(false);
  });

  test("listInvitesInput defaults limit and offset", () => {
    expect(listInvitesInput.safeParse(undefined).success).toBe(true);
  });

  test("resendInviteInput requires inviteId", () => {
    expect(resendInviteInput.safeParse({ inviteId: "id1" }).success).toBe(true);
    expect(resendInviteInput.safeParse({}).success).toBe(false);
  });

  test("revokeInviteInput requires inviteId", () => {
    expect(revokeInviteInput.safeParse({ inviteId: "id1" }).success).toBe(true);
  });

  test("reviewTutorProfileInput validates action enum", () => {
    expect(
      reviewTutorProfileInput.safeParse({
        tutorProfileId: "p1",
        action: "publish",
      }).success,
    ).toBe(true);
    expect(
      reviewTutorProfileInput.safeParse({
        tutorProfileId: "p1",
        action: "invalid",
      }).success,
    ).toBe(false);
  });

  test("reviewTutorProfileInput rejects non-HTTP(S) public photos", () => {
    expect(
      reviewTutorProfileInput.safeParse({
        tutorProfileId: "p1",
        action: "publish",
        publicPhotoUrl: "https://example.com/photo.jpg",
      }).success,
    ).toBe(true);
    expect(
      reviewTutorProfileInput.safeParse({
        tutorProfileId: "p1",
        action: "publish",
        publicPhotoUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});
