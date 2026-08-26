import { describe, test, expect } from "bun:test";
import { createInviteService } from "../../modules/invite/invite.service";
import type { InviteRepo } from "../../modules/invite/invite.repo";
import type { tutorInvite, tutorProfile } from "@cogito-app/db/schema";
import {
  InviteNotFoundError,
  InviteEmailMismatchError,
  ProfileAlreadyExistsError,
  InvalidRoleForClaimError,
} from "../../modules/invite/invite.errors";

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
  overrides: Partial<InviteRepo> = {},
  userRole: string = "student",
) {
  const inviteRepo: Partial<InviteRepo> = {
    findInviteByToken: async () => invite,
    findTutorProfileByUserId: async () => existingProfile,
    getUserRoleById: async () => userRole,
    updateInviteStatus: async () => [makeInvite({ status: "accepted" })],
    insertTutorProfile: async () => ({ id: "tp1" }) as any,
    updateUserRole: async () => {},
    ...overrides,
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
  describe("verify", () => {
    test("throws InviteNotFoundError for null invite", async () => {
      const service = makeService(undefined, undefined);
      await expect(service.verify("tok1")).rejects.toThrow(InviteNotFoundError);
    });

    test("returns invite details for valid token", async () => {
      const service = makeService(makeInvite(), undefined);
      const result = await service.verify("tok1");
      expect(result.email).toBe("tutor@example.com");
      expect(result.inviteId).toBe("inv1");
    });
  });

  describe("claim", () => {
    test("throws InviteNotFoundError for null invite", async () => {
      const service = makeService(undefined, undefined);
      await expect(
        service.claim("u1", "tutor@example.com", "tok1"),
      ).rejects.toThrow(InviteNotFoundError);
    });

    test("throws InviteEmailMismatchError when email does not match", async () => {
      const service = makeService(
        makeInvite({ email: "other@example.com" }),
        undefined,
      );
      await expect(
        service.claim("u1", "tutor@example.com", "tok1"),
      ).rejects.toThrow(InviteEmailMismatchError);
    });

    test("throws ProfileAlreadyExistsError when user already has tutor profile", async () => {
      const profile = { id: "tp1" } as TutorProfileRow;
      const service = makeService(
        makeInvite({ email: "tutor@example.com" }),
        profile,
      );
      await expect(
        service.claim("u1", "tutor@example.com", "tok1"),
      ).rejects.toThrow(ProfileAlreadyExistsError);
    });

    test("throws InviteNotFoundError when updateInviteStatus returns empty", async () => {
      const service = makeService(makeInvite(), undefined, {
        updateInviteStatus: async () => [],
      } as any);
      await expect(
        service.claim("u1", "tutor@example.com", "tok1"),
      ).rejects.toThrow(InviteNotFoundError);
    });

    test("successfully claims invite", async () => {
      const service = makeService(makeInvite(), undefined);
      const result = await service.claim("u1", "tutor@example.com", "tok1");
      expect(result.invite.id).toBe("inv1");
      expect(result.profile).toEqual({ id: "tp1" });
    });

    test("throws InvalidRoleForClaimError when claiming with an admin account", async () => {
      const service = makeService(makeInvite(), undefined, {}, "admin");
      await expect(
        service.claim("u1", "tutor@example.com", "tok1"),
      ).rejects.toThrow(InvalidRoleForClaimError);
    });
  });
});
