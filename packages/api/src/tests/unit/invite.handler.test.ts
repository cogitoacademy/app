import { describe, test, expect, mock } from "bun:test";
import {
  InviteNotFoundError,
  InviteEmailMismatchError,
  ProfileAlreadyExistsError,
} from "../../modules/invite/invite.errors";

function makeInviteRepo(overrides: Record<string, unknown> = {}) {
  return {
    findInviteByToken: mock(async () => null),
    updateInviteStatus: mock(async () => []),
    findTutorProfileByUserId: mock(async () => null),
    insertTutorProfile: mock(async () => ({ id: "tp1" })),
    updateUserRole: mock(async () => {}),
    ...overrides,
  };
}

function makeAuditPort() {
  return { record: mock(async () => {}) };
}

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      const tx = {
        ...makeDb(),
        ...makeInviteRepo(),
      };
      return fn(tx);
    }),
  } as any;
}

function makeValidInvite() {
  return {
    id: "inv1",
    email: "tutor@example.com",
    displayName: "Tutor",
    token: "tok1",
    status: "invited",
    invitedBy: "admin1",
    internalNotes: null,
    expiresAt: new Date(Date.now() + 86400000),
    acceptedBy: null,
    acceptedAt: null,
    revokedBy: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("InviteHandler", () => {
  describe("claim", () => {
    test("throws InviteNotFoundError when updateInviteStatus returns empty array (race condition)", async () => {
      const { createInviteService } =
        await import("../../modules/invite/invite.service");
      const validInvite = makeValidInvite();
      const inviteRepo = makeInviteRepo({
        findInviteByToken: mock(async () => validInvite),
        updateInviteStatus: mock(async () => []),
      });

      const service = createInviteService({
        inviteRepo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      await expect(
        service.claim("user1", "tutor@example.com", "tok1"),
      ).rejects.toThrow(InviteNotFoundError);
    });

    test("throws InviteNotFoundError when invite is null", async () => {
      const { createInviteService } =
        await import("../../modules/invite/invite.service");
      const inviteRepo = makeInviteRepo({
        findInviteByToken: mock(async () => undefined),
      });

      const service = createInviteService({
        inviteRepo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      await expect(
        service.claim("user1", "tutor@example.com", "tok1"),
      ).rejects.toThrow(InviteNotFoundError);
    });

    test("throws InviteEmailMismatchError when email does not match", async () => {
      const { createInviteService } =
        await import("../../modules/invite/invite.service");
      const invite = makeValidInvite();
      const inviteRepo = makeInviteRepo({
        findInviteByToken: mock(async () => invite),
      });

      const service = createInviteService({
        inviteRepo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      await expect(
        service.claim("user1", "other@example.com", "tok1"),
      ).rejects.toThrow(InviteEmailMismatchError);
    });

    test("throws ProfileAlreadyExistsError when user already has a tutor profile", async () => {
      const { createInviteService } =
        await import("../../modules/invite/invite.service");
      const invite = makeValidInvite();
      const existingProfile = { id: "tp1", userId: "user1" };
      const inviteRepo = makeInviteRepo({
        findInviteByToken: mock(async () => invite),
        findTutorProfileByUserId: mock(async () => existingProfile),
      });

      const service = createInviteService({
        inviteRepo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      await expect(
        service.claim("user1", "tutor@example.com", "tok1"),
      ).rejects.toThrow(ProfileAlreadyExistsError);
    });

    test("successfully claims invite", async () => {
      const { createInviteService } =
        await import("../../modules/invite/invite.service");
      const invite = makeValidInvite();
      const acceptedInvite = {
        ...invite,
        status: "accepted",
        acceptedBy: "user1",
      };
      const profile = { id: "tp1", userId: "user1" };
      const inviteRepo = makeInviteRepo({
        findInviteByToken: mock(async () => invite),
        updateInviteStatus: mock(async () => [acceptedInvite]),
        findTutorProfileByUserId: mock(async () => null),
        insertTutorProfile: mock(async () => profile),
        updateUserRole: mock(async () => {}),
      });

      const service = createInviteService({
        inviteRepo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      const result = await service.claim("user1", "tutor@example.com", "tok1");
      expect(result.invite).toEqual(acceptedInvite);
      expect(result.profile).toEqual(profile);
    });
  });
});
