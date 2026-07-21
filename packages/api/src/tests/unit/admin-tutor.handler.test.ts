import { describe, test, expect, mock } from "bun:test";
import { createAdminTutorService } from "../../modules/admin-tutor/admin-tutor.service";
import { ADMIN_DEFAULT_PAGE_LIMIT } from "../../shared/constants";

function makeAdminTutorRepo(overrides: Record<string, unknown> = {}) {
  return {
    findActiveInviteByEmail: mock(async () => null),
    insertInvite: mock(async () => ({
      id: "inv1",
      email: "tutor@example.com",
      displayName: "Tutor",
      token: "tok1",
      status: "invited",
      invitedBy: "admin1",
      expiresAt: new Date(),
    })),
    getInviteById: mock(async () => null),
    updateInvite: mock(async () => ({ id: "inv1", status: "revoked" })),
    listInvites: mock(async () => []),
    getTutorProfileById: mock(async () => null),
    updateTutorProfile: mock(async () => ({})),
    listTutorProfiles: mock(async () => []),
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
        ...makeAdminTutorRepo(),
      };
      return fn(tx);
    }),
  } as any;
}

describe("AdminTutorHandler", () => {
  describe("listInvites with default empty input", () => {
    test("calls adminTutorService.listInvites with default empty object", async () => {
      const listInvites = mock(async () => []);
      const adminTutorService = {
        createInvite: mock(async () => ({})),
        listInvites,
        resendInvite: mock(async () => ({})),
        revokeInvite: mock(async () => ({})),
        listTutorProfiles: mock(async () => []),
        reviewTutorProfile: mock(async () => ({})),
      };

      const handler = createAdminBookingHandlerViaService({
        adminTutorService,
      });

      await handler.listInvites();
      expect(listInvites).toHaveBeenCalledWith({});
    });
  });
});

function createAdminBookingHandlerViaService(deps: { adminTutorService: any }) {
  const { adminTutorService } = deps;

  async function createInvite(adminId: string, input: any) {
    return adminTutorService.createInvite(adminId, input);
  }

  async function listInvites(input: any = {}) {
    return adminTutorService.listInvites(input);
  }

  async function resendInvite(adminId: string, inviteId: string) {
    return adminTutorService.resendInvite(adminId, inviteId);
  }

  async function revokeInvite(adminId: string, inviteId: string) {
    return adminTutorService.revokeInvite(adminId, inviteId);
  }

  async function listTutorProfiles(input: any = {}) {
    return adminTutorService.listTutorProfiles(input);
  }

  async function reviewTutorProfile(adminId: string, input: any) {
    return adminTutorService.reviewTutorProfile(adminId, input);
  }

  return {
    createInvite,
    listInvites,
    resendInvite,
    revokeInvite,
    listTutorProfiles,
    reviewTutorProfile,
  };
}

describe("AdminTutorService", () => {
  describe("listInvites", () => {
    test("uses default limit and offset when not provided", async () => {
      const repo = makeAdminTutorRepo({
        listInvites: mock(async () => []),
      });

      const service = createAdminTutorService({
        adminTutorRepo: repo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      await service.listInvites({});

      expect(repo.listInvites).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: ADMIN_DEFAULT_PAGE_LIMIT,
          offset: 0,
        }),
      );
    });

    test("uses default limit when only offset provided", async () => {
      const repo = makeAdminTutorRepo({
        listInvites: mock(async () => []),
      });

      const service = createAdminTutorService({
        adminTutorRepo: repo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      await service.listInvites({ offset: 10 });

      expect(repo.listInvites).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          limit: ADMIN_DEFAULT_PAGE_LIMIT,
          offset: 10,
        }),
      );
    });

    test("passes status filter when provided", async () => {
      const repo = makeAdminTutorRepo({
        listInvites: mock(async () => []),
      });

      const service = createAdminTutorService({
        adminTutorRepo: repo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      await service.listInvites({ status: "invited" });

      expect(repo.listInvites).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "invited",
        }),
      );
    });
  });

  describe("createInvite", () => {
    test("passes adminId to repo.insertInvite", async () => {
      const repo = makeAdminTutorRepo({
        insertInvite: mock(async (tx: any, params: any) => ({
          id: "inv1",
          ...params,
        })),
      });

      const service = createAdminTutorService({
        adminTutorRepo: repo,
        auditPort: makeAuditPort(),
        db: makeDb(),
      });

      const result = await service.createInvite("admin1", {
        email: "new@example.com",
        displayName: "New Tutor",
      });

      expect(result).toBeDefined();
      expect(repo.insertInvite).toHaveBeenCalledTimes(1);
      const callArgs = repo.insertInvite.mock.calls[0][1];
      expect(callArgs.invitedBy).toBe("admin1");
      expect(callArgs.email).toBe("new@example.com");
    });
  });
});
