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

  describe("updateTutorProfileWithVersion", () => {
    test("updates achievements only when the expected version matches", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const updated = { id: "tp1", version: 3 };
      const returning = mock(async () => [updated]);
      const where = mock(() => ({ returning }));
      const set = mock(() => ({ where }));
      const update = mock(() => ({ set }));
      const conn = { update } as any;
      const education = [{ university: "University", degree: "Degree" }];
      const competitionAchievements = [
        { competitionName: "Competition", year: 2020, awards: ["Champion"] },
      ];

      const result = await repo.updateTutorProfileWithVersion(conn, "tp1", 2, {
        education,
        competitionAchievements,
      });

      expect(result).toEqual([updated]);
      expect(update).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ education, competitionAchievements }),
      );
      expect(where).toHaveBeenCalledTimes(1);
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

  describe("getTutorProfileById", () => {
    test("returns profile when found", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const profile = { id: "tp1", onboardingStatus: "pending_review" };
      const findFirst = mock(async () => profile);
      const conn = {
        query: {
          tutorProfile: { findFirst },
        },
      } as any;

      const result = await repo.getTutorProfileById(conn, "tp1");
      expect(result).toEqual(profile);
    });

    test("returns null when not found", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const findFirst = mock(async () => undefined);
      const conn = {
        query: {
          tutorProfile: { findFirst },
        },
      } as any;

      const result = await repo.getTutorProfileById(conn, "missing");
      expect(result).toBeNull();
    });
  });

  describe("updateTutorProfile", () => {
    test("updates and returns profile", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const repo = createAdminTutorRepo();
      const updated = { id: "tp1", onboardingStatus: "published" };
      const returning = mock(async () => [updated]);
      const where = mock(() => ({ returning }));
      const set = mock(() => ({ where }));
      const update = mock(() => ({ set }));
      const conn = { update } as any;

      const result = await repo.updateTutorProfile(conn, "tp1", {
        onboardingStatus: "published",
      });

      expect(result).toEqual(updated);
      expect(update).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          onboardingStatus: "published",
        }),
      );
    });
  });

  describe("findUserAccountsByEmail", () => {
    test("returns undefined when the email has no user account", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const findFirst = mock(async () => undefined);
      const findMany = mock(async () => []);
      const repo = createAdminTutorRepo();

      await expect(
        repo.findUserAccountsByEmail(
          {
            query: {
              user: { findFirst },
              account: { findMany },
            },
          } as any,
          "missing@example.com",
        ),
      ).resolves.toBeUndefined();
      expect(findMany).not.toHaveBeenCalled();
    });

    test("returns the user and linked auth providers", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const user = { id: "u1", email: "tutor@example.com" };
      const accounts = [{ providerId: "google" }];
      const findFirst = mock(async () => user);
      const findMany = mock(async () => accounts);
      const repo = createAdminTutorRepo();

      await expect(
        repo.findUserAccountsByEmail(
          {
            query: {
              user: { findFirst },
              account: { findMany },
            },
          } as any,
          user.email,
        ),
      ).resolves.toEqual({ ...user, accounts });
      expect(findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("subject helpers", () => {
    test("returns no specializations for an empty id list", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const findMany = mock(async () => []);
      const repo = createAdminTutorRepo();

      await expect(
        repo.listActiveChildSubjects(
          { query: { subjectCategory: { findMany } } } as any,
          [],
        ),
      ).resolves.toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    test("lists active specializations", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const rows = [{ id: "s1", parentId: "parent-1", isActive: true }];
      const findMany = mock(async () => rows);
      const repo = createAdminTutorRepo();

      await expect(
        repo.listActiveChildSubjects(
          { query: { subjectCategory: { findMany } } } as any,
          ["s1"],
        ),
      ).resolves.toEqual(rows);
      expect(findMany).toHaveBeenCalledTimes(1);
    });

    test("deletes and inserts tutor profile subjects", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const where = mock(async () => undefined);
      const deleteQuery = mock(() => ({ where }));
      const returning = mock(async () => [
        { tutorProfileId: "p1", subjectId: "s1" },
      ]);
      const values = mock(() => ({ returning }));
      const insert = mock(() => ({ values }));
      const repo = createAdminTutorRepo();

      await expect(
        repo.replaceTutorProfileSubjects(
          { delete: deleteQuery, insert } as any,
          "p1",
          ["s1"],
        ),
      ).resolves.toEqual([{ tutorProfileId: "p1", subjectId: "s1" }]);
      expect(deleteQuery).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledWith([
        { tutorProfileId: "p1", subjectId: "s1" },
      ]);
    });

    test("does not insert subjects when the replacement list is empty", async () => {
      const { createAdminTutorRepo } =
        await import("../../modules/admin-tutor/admin-tutor.repo");
      const where = mock(async () => undefined);
      const deleteQuery = mock(() => ({ where }));
      const insert = mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      }));
      const repo = createAdminTutorRepo();

      await expect(
        repo.replaceTutorProfileSubjects(
          { delete: deleteQuery, insert } as any,
          "p1",
          [],
        ),
      ).resolves.toEqual([]);
      expect(insert).not.toHaveBeenCalled();
    });
  });

  test("updates the canonical tutor profile image", async () => {
    const { createAdminTutorRepo } =
      await import("../../modules/admin-tutor/admin-tutor.repo");
    const row = { id: "u1", image: "https://example.com/photo.jpg" };
    const returning = mock(async () => [row]);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const repo = createAdminTutorRepo();
    await expect(
      repo.updateTutorProfileImage({ update } as any, "u1", row.image),
    ).resolves.toEqual(row);
    expect(set).toHaveBeenCalledWith({ image: row.image });
  });

  test("lists tutor profile history with actor details", async () => {
    const { createAdminTutorRepo } =
      await import("../../modules/admin-tutor/admin-tutor.repo");
    const repo = createAdminTutorRepo();
    const rows = [{ id: "audit-1", action: "tutor_profile_reviewed" }];
    const findMany = mock(async () => rows);
    const conn = {
      query: {
        auditLog: { findMany },
      },
    } as any;

    await expect(
      repo.listTutorProfileHistory(conn, "profile-1"),
    ).resolves.toEqual(rows);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
        with: {
          actor: { columns: { id: true, name: true, email: true } },
        },
      }),
    );
  });
});
