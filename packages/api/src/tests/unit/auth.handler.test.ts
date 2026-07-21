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
    test("delegates to authService.me", async () => {
      const authService = createAuthService({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });
      const handler = createAuthHandler({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        authService,
      });

      const result = await handler.me("u1");

      expect(result.wallet.id).toBe("w1");
      expect(result.wallet.totalBalance).toBe(100);
    });
  });

  describe("getProfile", () => {
    test("delegates to authService.getProfile", async () => {
      const authService = createAuthService({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });
      const handler = createAuthHandler({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        authService,
      });

      const result = await handler.getProfile("u1");

      expect(result.userId).toBe("u1");
    });
  });

  describe("updateProfile", () => {
    test("delegates to authService.updateProfile", async () => {
      const authService = createAuthService({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        db: makeDb(),
      });
      const handler = createAuthHandler({
        authRepo: makeAuthRepo() as any,
        walletPort: makeWalletPort() as any,
        authService,
      });

      const result = await handler.updateProfile("u1", { phoneNumber: "123" });

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
    test("returns ok for valid input", () => {
      const result = validateUpdateInput({ phoneNumber: "123" });
      expect(result.ok).toBe(true);
    });

    test("returns error for blank phoneNumber", () => {
      const result = validateUpdateInput({ phoneNumber: "  " });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("phoneNumber");
      }
    });

    test("returns error for blank parentEmail", () => {
      const result = validateUpdateInput({ parentEmail: "  " });
      expect(result.ok).toBe(false);
    });

    test("returns ok when fields are undefined", () => {
      const result = validateUpdateInput({});
      expect(result.ok).toBe(true);
    });

    test("returns ok for non-blank field values", () => {
      const result = validateUpdateInput({ schoolName: "Test School" });
      expect(result.ok).toBe(true);
    });
  });
});
