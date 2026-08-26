import { describe, test, expect, beforeAll } from "bun:test";

import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

/**
 * Task 17 (F16–F19): role-scope drift guards.
 *
 * - `auth.searchStudents` must be student-only (F16) — tutors/admins get FORBIDDEN
 * - `achievement.create/update/delete` must be student-only (F17)
 * - `payment.createPurchase` must be verified-student-only (F18 — wired in Part A)
 * - `upload.createUploadUrl` stays `protectedProcedure` (F19 — any authenticated
 *   role may mint a bounded upload URL; the tutor proof-file path needs it)
 */
describe("role-scope guards (F16–F19)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  let studentClient: ReturnType<typeof createTestClient>;
  let tutorClient: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `scope.student.${ts}@cogito.test`,
      "Test1234!",
      "Scope Student",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );

    const tutorRes = await signUpAndSignIn(
      `scope.tutor.${ts}@cogito.test`,
      "Test1234!",
      "Scope Tutor",
    );
    const tutorCtx = await createTestContext(tutorRes.cookie);
    if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
    await setUserRole(tutorCtx.session.user.id, "tutor");
    tutorClient = createTestClient(await createTestContext(tutorRes.cookie));
  });

  test("F16: tutor calling auth.searchStudents gets FORBIDDEN", async () => {
    await expect(
      tutorClient.auth.searchStudents({ query: "alex", limit: 5 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("F16: student calling auth.searchStudents succeeds", async () => {
    const result = await studentClient.auth.searchStudents({
      query: "alex",
      limit: 5,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  test("F17: tutor calling achievement.create gets FORBIDDEN", async () => {
    await expect(
      tutorClient.achievement.create({
        eventName: "Olympiad",
        category: "competition",
        award: "Gold",
        level: "national",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("F17: student calling achievement.create succeeds (submitted for review)", async () => {
    const created = await studentClient.achievement.create({
      eventName: "Scope Olympiad",
      category: "competition",
      award: "Gold",
      level: "national",
    });
    expect(created.id).toBeDefined();
  });

  test("F18: tutor calling payment.createPurchase gets FORBIDDEN", async () => {
    await expect(
      tutorClient.payment.createPurchase({ packageCode: "starter" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
