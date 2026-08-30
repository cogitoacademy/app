import { describe, test, expect, mock } from "bun:test";
import { createAdminHandler } from "../../modules/admin/admin.handler";
import {
  createAdminService,
  validateRoleChange,
} from "../../modules/admin/admin.service";
import { USER_ROLE } from "../../shared/constants";
import {
  UserNotFoundError,
  LastAdminError,
} from "../../modules/admin/admin.errors";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      return fn({
        ...makeDb(),
      });
    }),
  } as any;
}

function makeAdminRepo(overrides: Record<string, unknown> = {}) {
  return {
    listUsers: mock(async () => [{ id: "u1", role: "student" }]),
    countUsers: mock(async () => 1),
    getById: mock(async () => ({
      id: "u1",
      role: "student",
    })),
    countAdmins: mock(async () => 2),
    lockAdminRows: mock(async () => {}),
    updateRole: mock(async () => ({
      id: "u1",
      role: "tutor",
    })),
    updateRoleWithExpected: mock(async () => [{ id: "u1", role: "tutor" }]),
    ...overrides,
  };
}

function makeAuditPort() {
  return { record: mock(async () => {}) };
}

function makeWalletPort() {
  return {
    getByUserId: mock(async () => null),
    listLedger: mock(async () => ({ items: [], nextCursor: null })),
  };
}

describe("AdminHandler", () => {
  test("delegates tutor payout reads and payment marking", async () => {
    const service = {
      getPendingTutorPayouts: mock(async () => ({ total: 10 })),
      markTutorPayoutPaid: mock(async () => ({ id: "p1" })),
    } as any;
    const handler = createAdminHandler(service);
    const context = { session: { user: { id: "admin1" } } } as any;
    const input = { tutorId: "t1" };

    await expect(
      handler.getPendingTutorPayouts({ context, input }),
    ).resolves.toEqual({ total: 10 });
    await expect(
      handler.markTutorPayoutPaid({ context, input }),
    ).resolves.toEqual({ id: "p1" });
    expect(service.getPendingTutorPayouts).toHaveBeenCalledWith(input);
    expect(service.markTutorPayoutPaid).toHaveBeenCalledWith("admin1", input);
  });

  describe("listUsers", () => {
    test("calls adminService.listUsers with input from handler", async () => {
      const repo = makeAdminRepo();
      const auditPort = makeAuditPort();
      const db = makeDb();
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: auditPort as any,
        db,
        wallet: makeWalletPort() as any,
      });
      const handler = createAdminHandler(service);
      const context = {
        session: { user: { id: "admin1" } },
      } as any;
      const input = { limit: 10, offset: 0 };

      const result = await handler.listUsers({ context, input });

      expect(result.users).toEqual([{ id: "u1", role: "student" }]);
      expect(result.total).toBe(1);
    });
  });

  describe("setRole", () => {
    test("calls adminService.setRole with session user id and input", async () => {
      const repo = makeAdminRepo();
      const auditPort = makeAuditPort();
      const db = makeDb();
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: auditPort as any,
        db,
        wallet: makeWalletPort() as any,
      });
      const handler = createAdminHandler(service);
      const context = {
        session: { user: { id: "admin1" } },
      } as any;
      const input = { userId: "u1", role: "tutor", expectedRole: "student" };

      const result = await handler.setRole({ context, input });

      expect(result.id).toBe("u1");
    });
  });
});

describe("AdminService", () => {
  describe("listUsers", () => {
    test("returns users and total with default limit and offset", async () => {
      const repo = makeAdminRepo({
        listUsers: mock(async () => [{ id: "u1" }]),
        countUsers: mock(async () => 5),
      });
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
        wallet: makeWalletPort() as any,
      });

      const result = await service.listUsers({});

      expect(result.users).toEqual([{ id: "u1" }]);
      expect(result.total).toBe(5);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(repo.listUsers).toHaveBeenCalledWith(expect.anything(), 50, 0);
    });

    test("uses provided limit and offset", async () => {
      const repo = makeAdminRepo({
        listUsers: mock(async () => []),
        countUsers: mock(async () => 0),
      });
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
        wallet: makeWalletPort() as any,
      });

      const result = await service.listUsers({ limit: 10, offset: 20 });

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
      expect(repo.listUsers).toHaveBeenCalledWith(expect.anything(), 10, 20);
    });

    test("runs listUsers and countUsers in parallel", async () => {
      let listCalled = false;
      let countCalled = false;
      const repo = makeAdminRepo({
        listUsers: mock(async () => {
          listCalled = true;
          return [];
        }),
        countUsers: mock(async () => {
          countCalled = true;
          return 0;
        }),
      });
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
        wallet: makeWalletPort() as any,
      });

      await service.listUsers({});

      expect(listCalled).toBe(true);
      expect(countCalled).toBe(true);
    });
  });

  describe("setRole", () => {
    test("throws UserNotFoundError when target user does not exist", async () => {
      const repo = makeAdminRepo({
        getById: mock(async () => null),
      });
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
        wallet: makeWalletPort() as any,
      });

      try {
        await service.setRole("admin1", {
          userId: "u1",
          role: "tutor",
          expectedRole: "student",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(UserNotFoundError);
        expect(e.code).toBe("USER_NOT_FOUND");
      }
    });

    test("throws LastAdminError when demoting the last admin", async () => {
      const repo = makeAdminRepo({
        getById: mock(async () => ({
          id: "u1",
          role: USER_ROLE.ADMIN,
        })),
        countAdmins: mock(async () => 1),
      });
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
        wallet: makeWalletPort() as any,
      });

      try {
        await service.setRole("admin1", {
          userId: "u1",
          role: "student",
          expectedRole: "admin",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(LastAdminError);
        expect(e.code).toBe("LAST_ADMIN");
      }
    });

    test("updates role and records audit in transaction", async () => {
      const updatedUser = { id: "u1", role: "tutor" };
      const repo = makeAdminRepo({
        getById: mock(async () => ({
          id: "u1",
          role: "student",
        })),
        updateRoleWithExpected: mock(async () => [updatedUser]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: auditPort as any,
        db: makeDb(),
        wallet: makeWalletPort() as any,
      });

      const result = await service.setRole("admin1", {
        userId: "u1",
        role: "tutor",
        expectedRole: "student",
      });

      expect(result.role).toBe("tutor");
      expect(auditPort.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user_role_changed",
          targetId: "u1",
          beforeState: { role: "student" },
          afterState: { role: "tutor" },
        }),
      );
    });

    test("allows demoting admin when other admins exist", async () => {
      const updatedUser = { id: "u1", role: "student" };
      const repo = makeAdminRepo({
        getById: mock(async () => ({
          id: "u1",
          role: USER_ROLE.ADMIN,
        })),
        countAdmins: mock(async () => 3),
        updateRoleWithExpected: mock(async () => [updatedUser]),
      });
      const auditPort = makeAuditPort();
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: auditPort as any,
        db: makeDb(),
        wallet: makeWalletPort() as any,
      });

      const result = await service.setRole("admin1", {
        userId: "u1",
        role: "student",
        expectedRole: "admin",
      });

      expect(result.role).toBe("student");
    });
  });
});

describe("validateRoleChange", () => {
  test("throws UserNotFoundError for null target", () => {
    expect(() => validateRoleChange(null, "tutor", 2, "u1")).toThrow(
      UserNotFoundError,
    );
  });

  test("returns previousRole for student to tutor change", () => {
    const result = validateRoleChange(
      { id: "u1", role: "student" },
      "tutor",
      2,
      "u1",
    );
    expect(result.previousRole).toBe("student");
  });

  test("throws LastAdminError for demoting last admin", () => {
    expect(() =>
      validateRoleChange({ id: "u1", role: "admin" }, "student", 1, "u1"),
    ).toThrow(LastAdminError);
  });

  test("returns previousRole for demoting admin with multiple admins", () => {
    const result = validateRoleChange(
      { id: "u1", role: "admin" },
      "student",
      3,
      "u1",
    );
    expect(result.previousRole).toBe("admin");
  });

  test("returns previousRole for admin to admin (no change)", () => {
    const result = validateRoleChange(
      { id: "u1", role: "admin" },
      "admin",
      1,
      "u1",
    );
    expect(result.previousRole).toBe("admin");
  });
});
