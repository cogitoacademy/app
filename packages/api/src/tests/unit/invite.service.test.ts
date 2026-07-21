import { describe, test, expect } from "bun:test";
import { createInviteService } from "../../modules/invite/invite.service";
import type { InviteRepo } from "../../modules/invite/invite.repo";
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

function makeService(
  invite: InviteRow | undefined,
  existingProfile: TutorProfileRow | undefined,
) {
  const inviteRepo: Partial<InviteRepo> = {
    findInviteByToken: async () => invite,
    findTutorProfileByUserId: async () => existingProfile,
    updateInviteStatus: async () => [null],
    insertTutorProfile: async () => ({ id: "tp1" }) as any,
    updateUserRole: async () => {},
  };
  const auditPort = { record: async () => {} };
  const db = {
    transaction: async (fn: any) => fn({}),
  } as any;
  return createInviteService({
    inviteRepo: inviteRepo as InviteRepo,
    auditPort: auditPort as any,
    db,
  });
}

describe("Invite Service", () => {
  describe("validateClaim (via claim)", () => {
    test("throws for null invite", async () => {
      const service = makeService(undefined, undefined);
      await expect(
        service.claim("u1", "tutor@example.com", "tok1"),
      ).rejects.toThrow();
    });

    test("throws when email does not match", async () => {
      const service = makeService(
        makeInvite({ email: "other@example.com" }),
        undefined,
      );
      await expect(
        service.claim("u1", "tutor@example.com", "tok1"),
      ).rejects.toThrow();
    });

    test("throws when user already has tutor profile", async () => {
      const profile = { id: "tp1" } as TutorProfileRow;
      const service = makeService(
        makeInvite({ email: "tutor@example.com" }),
        profile,
      );
      await expect(
        service.claim("u1", "tutor@example.com", "tok1"),
      ).rejects.toThrow();
    });
  });
});
