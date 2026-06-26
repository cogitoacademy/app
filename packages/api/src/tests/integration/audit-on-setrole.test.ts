import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { auditLog } from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  cleanUser,
  type TestClient,
} from "../helpers/test-client";

describe("Admin setRole audit + last-admin guard", () => {
  const ts = Date.now();
  const adminEmail = `audit-admin.${ts}@cogito.test`;
  const studentEmail = `audit-student.${ts}@cogito.test`;
  let adminClient: TestClient;
  let adminId: string;
  let studentId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "Audit Admin",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session not found");
    adminId = adminCtx.session.user.id;
    await setUserRole(adminId, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Audit Student",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session not found");
    studentId = studentCtx.session.user.id;
  });

  afterAll(async () => {
    await cleanUser(adminEmail);
    await cleanUser(studentEmail);
  });

  test("setRole writes an audit log entry", async () => {
    const result = await adminClient.admin.setRole({
      userId: studentId,
      role: "tutor",
    });

    expect(result.role).toBe("tutor");

    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, studentId));

    const roleLog = logs.find((l) => l.action === "user_role_changed");
    expect(roleLog).toBeDefined();
    expect(roleLog!.actorId).toBe(adminId);
    expect(roleLog!.actorType).toBe("admin");
    expect(roleLog!.beforeState).toEqual({ role: "student" });
    expect(roleLog!.afterState).toEqual({ role: "tutor" });
  });

  test("cannot demote the last admin", async () => {
    await expect(
      adminClient.admin.setRole({
        userId: adminId,
        role: "student",
      }),
    ).rejects.toThrow();
  });
});
