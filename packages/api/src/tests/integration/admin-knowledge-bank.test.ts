import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import { db } from "@cogito-app/db";
import {
  auditLog,
  knowledgeBankAccessGrant,
  user,
} from "@cogito-app/db/schema";

import { services } from "../../services";
import {
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

async function createTestUser(
  email: string,
  role: "student" | "admin" = "student",
) {
  await signUpAndSignIn(
    email,
    "Test1234!",
    role === "admin" ? "KB Admin" : "KB Student",
  );
  const created = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  if (!created) throw new Error(`Test user was not created: ${email}`);
  if (role !== "student") await setUserRole(created.id, role);
  return { ...created, role };
}

describe("Admin Knowledge Bank access grants", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  test("creates, expires, updates, and removes a student exception", async () => {
    const suffix = Date.now();
    const student = await createTestUser(
      `kb-access-student-${suffix}@cogito.test`,
    );
    const admin = await createTestUser(
      `kb-access-admin-${suffix}@cogito.test`,
      "admin",
    );

    await services.wallet.getOrCreate(student.id);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const created = await services.adminKnowledgeBank.create(admin.id, {
      email: student.email,
      expiresAt,
      note: "Legacy package",
    });

    expect(created.studentEmail).toBe(student.email);
    expect(created.status).toBe("active");
    await expect(
      services.wallet.knowledgeBankEligible(student.id, "student"),
    ).resolves.toMatchObject({
      eligible: true,
      overrideExpiresAt: expect.any(String),
    });

    const updated = await services.adminKnowledgeBank.update(admin.id, {
      id: created.id,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      note: "Renewed legacy package",
    });
    expect(updated.note).toBe("Renewed legacy package");

    const all = await services.adminKnowledgeBank.list({ status: "all" });
    expect(all.some((grant) => grant.id === created.id)).toBe(true);
    const searched = await services.adminKnowledgeBank.list({
      status: "all",
      search: student.email,
    });
    expect(searched).toHaveLength(1);
    expect(searched[0]?.studentEmail).toBe(student.email);

    const listed = await services.adminKnowledgeBank.list({ status: "active" });
    expect(listed.some((grant) => grant.id === created.id)).toBe(true);

    await expect(
      services.adminKnowledgeBank.create(admin.id, {
        email: student.email,
        expiresAt,
      }),
    ).rejects.toThrow("already has");

    await services.adminKnowledgeBank.remove(admin.id, created.id);
    await expect(
      services.wallet.knowledgeBankEligible(student.id, "student"),
    ).resolves.toMatchObject({ eligible: false });
    await expect(
      services.adminKnowledgeBank.update(admin.id, {
        id: created.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toThrow("not found");
    await expect(
      services.adminKnowledgeBank.remove(admin.id, created.id),
    ).rejects.toThrow("not found");

    const actions = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetId, created.id),
          eq(auditLog.targetType, "knowledge_bank_access_grant"),
        ),
      );
    expect(actions.map((row) => row.action)).toEqual([
      "knowledge_bank_access_grant_created",
      "knowledge_bank_access_grant_updated",
      "knowledge_bank_access_grant_removed",
    ]);
  });

  test("does not bypass the threshold after the stored expiry", async () => {
    const suffix = Date.now();
    const student = await createTestUser(
      `kb-access-expired-${suffix}@cogito.test`,
    );
    const admin = await createTestUser(
      `kb-access-expired-admin-${suffix}@cogito.test`,
      "admin",
    );

    await expect(
      services.adminKnowledgeBank.create(admin.id, {
        email: `missing-${suffix}@cogito.test`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toThrow("No student account");

    await db.insert(knowledgeBankAccessGrant).values({
      userId: student.id,
      grantedByUserId: admin.id,
      expiresAt: new Date(Date.now() - 60_000),
      note: "expired legacy access",
    });

    await expect(
      services.wallet.knowledgeBankEligible(student.id, "student"),
    ).resolves.toMatchObject({ eligible: false });
    await expect(
      services.adminKnowledgeBank.list({ status: "expired" }),
    ).resolves.toEqual([
      expect.objectContaining({
        studentEmail: student.email,
        status: "expired",
      }),
    ]);
  });
});
