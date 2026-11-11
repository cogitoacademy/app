import { expect, test } from "bun:test";
import { canUseTutorInviteForSignup } from "./tutor-invite-signup";
const now = new Date("2026-11-11T00:00:00Z");
const invite = {
  email: "Tutor@example.com",
  status: "invited",
  expiresAt: new Date("2026-11-12T00:00:00Z"),
};
test("only a live invitation for the signup email can replace student consent", () => {
  expect(canUseTutorInviteForSignup(invite, "tutor@example.com", now)).toBe(
    true,
  );
  expect(canUseTutorInviteForSignup(undefined, "tutor@example.com", now)).toBe(
    false,
  );
  expect(canUseTutorInviteForSignup(invite, "other@example.com", now)).toBe(
    false,
  );
  for (const status of ["accepted", "expired", "revoked"])
    expect(
      canUseTutorInviteForSignup(
        { ...invite, status },
        "tutor@example.com",
        now,
      ),
    ).toBe(false);
  expect(
    canUseTutorInviteForSignup(
      { ...invite, expiresAt: now },
      "tutor@example.com",
      now,
    ),
  ).toBe(false);
});
