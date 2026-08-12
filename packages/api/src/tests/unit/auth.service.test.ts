import { describe, test, expect } from "bun:test";
import { createAuthService } from "../../modules/auth/auth.service";

function makeAuthService() {
  const authRepo = {
    getStudentProfile: async () => null,
    getTutorProfile: async () => null,
    upsertProfile: async (
      _db: unknown,
      _userId: string,
      input: Record<string, unknown>,
    ) => input,
    createProfile: async (
      _db: unknown,
      _userId: string,
      input: Record<string, unknown>,
    ) => input,
    searchStudents: async (
      _db: unknown,
      query: string,
      excludeUserId: string,
      _limit: number,
    ) =>
      query === "friend"
        ? [
            {
              id: "friend1",
              name: "Friend",
              email: "friend@example.com",
              excludeUserId,
            },
          ]
        : [],
  };
  const walletPort = {
    getOrCreate: async () => ({
      id: "w1",
      totalBalance: 0,
      heldBalance: 0,
      availableBalance: 0,
    }),
  };
  const db = {} as any;
  return createAuthService({ authRepo: authRepo as any, walletPort, db });
}

describe("Auth Service", () => {
  describe("updateProfile (blank string validation handled by Zod)", () => {
    const service = makeAuthService();

    test("does not throw for valid non-empty fields", async () => {
      await expect(
        service.updateProfile("u1", {
          phoneNumber: "0812345678",
          schoolName: "SMA 1",
        }),
      ).resolves.toBeDefined();
    });

    test("does not throw for undefined optional fields", async () => {
      await expect(
        service.updateProfile("u1", {
          phoneNumber: undefined,
          schoolName: undefined,
        }),
      ).resolves.toBeDefined();
    });

    test("does not throw for valid string fields alongside undefined", async () => {
      await expect(
        service.updateProfile("u1", {
          phoneNumber: "123",
          schoolName: undefined,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("searchStudents", () => {
    const service = makeAuthService();

    test("returns matching students", async () => {
      const result = await service.searchStudents("u1", " friend ", 5);
      expect(result[0]?.id).toBe("friend1");
      expect(result[0]?.excludeUserId).toBe("u1");
    });

    test("returns null when no student matches", async () => {
      expect(service.searchStudents("u1", "missing", 5)).resolves.toEqual([]);
    });
  });
});
