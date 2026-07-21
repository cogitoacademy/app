import { describe, test, expect, mock } from "bun:test";

describe("AdminTutorRepo", () => {
  describe("listInvites", () => {
    test("queries with status filter when status is provided", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const rows = [{ id: "inv1", status: "invited" }];
      const findMany = mock(async () => rows);
      const conn = {
        query: {
          tutorInvite: { findMany },
        },
      } as any;

      const result = await repo.listInvites(conn, {
        status: "invited",
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual(rows);
      expect(findMany).toHaveBeenCalledTimes(1);
      const callArg = findMany.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
      expect(callArg.limit).toBe(20);
      expect(callArg.offset).toBe(0);
    });

    test("queries without status filter when status is undefined", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const rows = [
        { id: "inv1", status: "invited" },
        { id: "inv2", status: "accepted" },
      ];
      const findMany = mock(async () => rows);
      const conn = {
        query: {
          tutorInvite: { findMany },
        },
      } as any;

      const result = await repo.listInvites(conn, {
        limit: 10,
        offset: 5,
      });

      expect(result).toEqual(rows);
      expect(findMany).toHaveBeenCalledTimes(1);
      const callArg = findMany.mock.calls[0][0];
      expect(callArg.where).toBeUndefined();
      expect(callArg.limit).toBe(10);
      expect(callArg.offset).toBe(5);
    });
  });

  describe("findActiveInviteByEmail", () => {
    test("returns invite when found", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const invite = {
        id: "inv1",
        email: "test@example.com",
        status: "invited",
      };
      const findFirst = mock(async () => invite);
      const conn = {
        query: {
          tutorInvite: { findFirst },
        },
      } as any;

      const result = await repo.findActiveInviteByEmail(
        conn,
        "test@example.com",
      );

      expect(result).toEqual(invite);
    });

    test("returns null when not found", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const findFirst = mock(async () => undefined);
      const conn = {
        query: {
          tutorInvite: { findFirst },
        },
      } as any;

      const result = await repo.findActiveInviteByEmail(
        conn,
        "missing@example.com",
      );

      expect(result).toBeNull();
    });
  });

  describe("insertInvite", () => {
    test("inserts and returns invite", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const inserted = { id: "inv1", email: "test@example.com" };
      const returning = mock(async () => [inserted]);
      const values = mock(() => ({ returning }));
      const insert = mock(() => ({ values }));
      const conn = { insert } as any;

      const result = await repo.insertInvite(conn, {
        email: "test@example.com",
        displayName: "Test",
        token: "tok1",
        status: "invited",
        invitedBy: "admin1",
        expiresAt: new Date(),
      });

      expect(result).toEqual(inserted);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledTimes(1);
    });
  });

  describe("getInviteById", () => {
    test("returns invite when found", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const invite = { id: "inv1" };
      const findFirst = mock(async () => invite);
      const conn = {
        query: {
          tutorInvite: { findFirst },
        },
      } as any;

      const result = await repo.getInviteById(conn, "inv1");

      expect(result).toEqual(invite);
    });

    test("returns null when not found", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const findFirst = mock(async () => undefined);
      const conn = {
        query: {
          tutorInvite: { findFirst },
        },
      } as any;

      const result = await repo.getInviteById(conn, "missing");

      expect(result).toBeNull();
    });
  });

  describe("updateInvite", () => {
    test("updates and returns invite", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const updated = { id: "inv1", status: "revoked" };
      const returning = mock(async () => [updated]);
      const where = mock(() => ({ returning }));
      const set = mock(() => ({ where }));
      const update = mock(() => ({ set }));
      const conn = { update } as any;

      const result = await repo.updateInvite(conn, "inv1", {
        status: "revoked",
      });

      expect(result).toEqual(updated);
      expect(update).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  describe("listTutorProfiles", () => {
    test("queries with status filter when status is provided", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const profiles = [{ id: "tp1", onboardingStatus: "published" }];
      const findMany = mock(async () => profiles);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      const result = await repo.listTutorProfiles(conn, {
        status: "published",
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual(profiles);
      const callArg = findMany.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
    });

    test("queries without status filter when status is undefined", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const findMany = mock(async () => []);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      await repo.listTutorProfiles(conn, { limit: 20, offset: 0 });

      const callArg = findMany.mock.calls[0][0];
      expect(callArg.where).toBeUndefined();
    });
  });
});
