import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { wallet } from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

async function creditWallet(userId: string, amount: number) {
  const { services } = await import("@cogito-app/api/services");
  const w = await services.wallet.getOrCreate(userId);
  await db
    .update(wallet)
    .set({ totalBalance: amount, availableBalance: amount })
    .where(eq(wallet.id, w.id));
}

describe("M9: Knowledge Bank eligibility is student-only (PRD FR-12)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.m9.${ts}@cogito.test`;
  const tutorEmail = `tutor.m9.${ts}@cogito.test`;
  const adminEmail = `admin.m9.${ts}@cogito.test`;

  let studentClient: TestClient;
  let tutorClient: TestClient;
  let adminClient: TestClient;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student M9",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 45);
    }

    const tutorRes = await signUpAndSignIn(tutorEmail, "Test1234!", "Tutor M9");
    const tutorCtx = await createTestContext(tutorRes.cookie);
    if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
    await setUserRole(tutorCtx.session.user.id, "tutor");
    // A tutor with >= threshold marks must NOT pass the gate.
    await creditWallet(tutorCtx.session.user.id, 100);
    tutorClient = createTestClient(await createTestContext(tutorRes.cookie));

    const adminRes = await signUpAndSignIn(adminEmail, "Test1234!", "Admin M9");
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    await creditWallet(adminCtx.session.user.id, 100);
    adminClient = createTestClient(await createTestContext(adminRes.cookie));
  });

  test("student with >= threshold marks is eligible", async () => {
    const result = await studentClient.wallet.knowledgeBankEligible({});
    expect(result.eligible).toBe(true);
  });

  test("tutor with >= threshold marks is FORBIDDEN", async () => {
    await expect(
      tutorClient.wallet.knowledgeBankEligible({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("admin with >= threshold marks is FORBIDDEN", async () => {
    await expect(
      adminClient.wallet.knowledgeBankEligible({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("unauthenticated request is UNAUTHORIZED", async () => {
    const { createTestClient: createClient } =
      await import("../helpers/test-client");
    const anon = createClient(await createTestContext(undefined));
    await expect(anon.wallet.knowledgeBankEligible({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
