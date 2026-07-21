import { describe, test, expect, mock } from "bun:test";
import { createAuthHandler } from "../../modules/auth/auth.handler";
import {
  createAuthService,
  validateUpdateInput,
} from "../../modules/auth/auth.service";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      return fn({
        ...makeDb(),
      });
    }),
  } as any;
}

function makeAuthRepo(overrides: Record<string, unknown> = {}) {
  return {
    getStudentProfile: mock(async () => ({
      id: "p1",
      userId: "u1",
      phoneNumber: "123",
      schoolName: "School",
      gradeLevel: "10",
      parentName: "Parent",
      parentPhone: "456",
      parentEmail: "p@test.com",
    })),
    getTutorProfile: mock(async () => null),
    upsertProfile: mock(async () => ({
      id: "p1",
      userId: "u1",
      phoneNumber: "123",
    })),
    createProfile: mock(async () => ({
      id: "p1",
      userId: "u1",
      phoneNumber: "123",
    })),
    ...overrides,
  };
}

function makeWalletPort() {
  return {
    getOrCreate: mock(async () => ({
      id: "w1",
      totalBalance: 100,
      heldBalance: 0,
      availableBalance: 100,
    })),
  };
}

describe("AuthHandler", () => {
  describe("me", () => {
    test("returns user, profile, tutorProfile, and wallet from authService", async () => {
      const authService = createAuthService({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });
      const handler = createAuthHandler(authService);
      const context = {
        session: { user: { id: "u1", email: "u1@test.com" } },
      } as any;

      const result = await handler.me({ context });

      expect(result.wallet.id).toBe("w1");
      expect(result.wallet.totalBalance).toBe(100);
      expect(result.user.id).toBe("u1");
    });
  });

  describe("getProfile", () => {
    test("calls authService.getProfile with userId from session", async () => {
      const authService = createAuthService({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });
      const handler = createAuthHandler(authService);
      const context = {
        session: { user: { id: "u1" } },
      } as any;

      const result = await handler.getProfile({ context });

      expect(result.userId).toBe("u1");
    });
  });

  describe("updateProfile", () => {
    test("calls authService.updateProfile with userId and input", async () => {
      const authService = createAuthService({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });
      const handler = createAuthHandler(authService);
      const context = {
        session: { user: { id: "u1" } },
      } as any;

      const result = await handler.updateProfile({
        context,
        input: { phoneNumber: "123" },
      });

      expect(result.userId).toBe("u1");
    });
  });
});

describe("AuthService", () => {
  describe("me", () => {
    test("returns profile, tutorProfile, and wallet from Promise.all", async () => {
      const profile = {
        id: "p1",
        userId: "u1",
        phoneNumber: "123",
        schoolName: "School",
        gradeLevel: "10",
        parentName: "Parent",
        parentPhone: "456",
        parentEmail: "p@test.com",
      };
      const tutorProfile = { id: "t1", userId: "u1" };
      const authRepo = makeAuthRepo({
        getStudentProfile: mock(async () => profile),
        getTutorProfile: mock(async () => tutorProfile),
      });
      const walletPort = makeWalletPort();
      const service = createAuthService({
        authRepo: authRepo as any,
        walletPort: walletPort as any,
        db: makeDb(),
      });

      const result = await service.me("u1");

      expect(result.profile).toEqual(profile);
      expect(result.tutorProfile).toEqual(tutorProfile);
      expect(result.wallet.id).toBe("w1");
      expect(result.wallet.totalBalance).toBe(100);
    });

    test("returns null profile when repo returns null", async () => {
      const authRepo = makeAuthRepo({
        getStudentProfile: mock(async () => null),
        getTutorProfile: mock(async () => null),
      });
      const walletPort = makeWalletPort();
      const service = createAuthService({
        authRepo: authRepo as any,
        walletPort: walletPort as any,
        db: makeDb(),
      });

      const result = await service.me("u1");

      expect(result.profile).toBeNull();
      expect(result.tutorProfile).toBeNull();
    });
  });

  describe("getProfile", () => {
    test("returns profile when found", async () => {
      const profile = {
        id: "p1",
        userId: "u1",
        phoneNumber: "123",
        schoolName: "School",
        gradeLevel: "10",
        parentName: "Parent",
        parentPhone: "456",
        parentEmail: "p@test.com",
      };
      const authRepo = makeAuthRepo({
        getStudentProfile: mock(async () => profile),
      });
      const service = createAuthService({
        authRepo: authRepo as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });

      const result = await service.getProfile("u1");

      expect(result).toEqual(profile);
    });

    test("throws notFound when profile is null", async () => {
      const authRepo = makeAuthRepo({
        getStudentProfile: mock(async () => null),
      });
      const service = createAuthService({
        authRepo: authRepo as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });

      try {
        await service.getProfile("u1");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("updateProfile", () => {
    test("calls upsertProfile when existing profile found", async () => {
      const existingProfile = {
        id: "p1",
        userId: "u1",
        phoneNumber: "123",
      };
      const upserted = { id: "p1", userId: "u1", phoneNumber: "999" };
      const authRepo = makeAuthRepo({
        getStudentProfile: mock(async () => existingProfile),
        upsertProfile: mock(async () => upserted),
      });
      const service = createAuthService({
        authRepo: authRepo as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });

      const result = await service.updateProfile("u1", { phoneNumber: "999" });

      expect(authRepo.upsertProfile).toHaveBeenCalledWith(
        expect.anything(),
        "u1",
        { phoneNumber: "999" },
      );
      expect(result).toEqual(upserted);
    });

    test("calls createProfile when no existing profile", async () => {
      const created = { id: "p1", userId: "u1", phoneNumber: "123" };
      const authRepo = makeAuthRepo({
        getStudentProfile: mock(async () => null),
        createProfile: mock(async () => created),
      });
      const service = createAuthService({
        authRepo: authRepo as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });

      const result = await service.updateProfile("u1", { phoneNumber: "123" });

      expect(authRepo.createProfile).toHaveBeenCalledWith(
        expect.anything(),
        "u1",
        { phoneNumber: "123" },
      );
      expect(result).toEqual(created);
    });

    test("throws validation error for blank phoneNumber", async () => {
      const service = createAuthService({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });

      try {
        await service.updateProfile("u1", { phoneNumber: "  " });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("BAD_REQUEST");
      }
    });

    test("throws validation error for blank schoolName", async () => {
      const service = createAuthService({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });

      try {
        await service.updateProfile("u1", { schoolName: "  " });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("BAD_REQUEST");
      }
    });
  });

  describe("validateUpdateInput", () => {
    test("does not throw for valid input", () => {
      expect(() => validateUpdateInput({ phoneNumber: "123" })).not.toThrow();
    });

    test("throws for blank phoneNumber", () => {
      expect(() => validateUpdateInput({ phoneNumber: "  " })).toThrow();
    });

    test("throws for blank parentEmail", () => {
      expect(() => validateUpdateInput({ parentEmail: "  " })).toThrow();
    });

    test("does not throw when fields are undefined", () => {
      expect(() => validateUpdateInput({})).not.toThrow();
    });

    test("does not throw for non-blank field values", () => {
      expect(() =>
        validateUpdateInput({ schoolName: "Test School" }),
      ).not.toThrow();
    });
  });
});
