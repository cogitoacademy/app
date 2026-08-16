import { describe, test, expect, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { achievement, auditLog } from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

describe("Achievement review flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.ach.${ts}@cogito.test`;
  const adminEmail = `admin.ach.${ts}@cogito.test`;

  let studentClient: TestClient;
  let adminClient: TestClient;
  let studentId: string;
  let adminId: string;
  let approvedAchievementId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Achieve",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    studentClient = createTestClient(studentCtx);

    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "Admin Achieve",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    adminId = adminCtx.session.user.id;
    await setUserRole(adminId, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));
  });

  test("student creates an achievement → pending", async () => {
    const created = await studentClient.achievement.create({
      eventName: "Olimpiade Matematika Nasional",
      category: "competition",
      award: "Medali Emas",
      level: "nasional",
      awardingDate: "2026-06-10",
      location: "Jakarta",
      description: "Juara 1 Olimpiade Matematika",
      subjects: ["Mathematics"],
    });

    approvedAchievementId = created.id;
    expect(created.status).toBe("pending");
    expect(created.version).toBe(1);
    expect(created.userId).toBe(studentId);

    const [row] = await db
      .select()
      .from(achievement)
      .where(eq(achievement.id, created.id))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.status).toBe("pending");
    expect(row!.eventName).toBe("Olimpiade Matematika Nasional");
  });

  test("student list returns the pending achievement", async () => {
    const list = await studentClient.achievement.list({});
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(approvedAchievementId);
    expect(list[0]!.status).toBe("pending");
  });

  test("admin approves → approved + audit log", async () => {
    const updated = await adminClient.achievement.adminReview({
      achievementId: approvedAchievementId,
      status: "approved",
      adminNote: "Bukti sudah diverifikasi",
    });
    expect(updated.status).toBe("approved");
    expect(updated.adminNote).toBe("Bukti sudah diverifikasi");

    const [row] = await db
      .select()
      .from(achievement)
      .where(eq(achievement.id, approvedAchievementId))
      .limit(1);
    expect(row!.status).toBe("approved");
    expect(row!.adminNote).toBe("Bukti sudah diverifikasi");

    const logs = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "achievement_approved"),
          eq(auditLog.targetId, approvedAchievementId),
        ),
      );
    expect(logs.length).toBe(1);
    expect(logs[0]!.actorId).toBe(adminId);
    expect(logs[0]!.actorType).toBe("admin");
    expect(logs[0]!.targetType).toBe("achievement");
    expect(logs[0]!.details).toMatchObject({
      previousStatus: "pending",
      adminNote: "Bukti sudah diverifikasi",
    });
  });

  test("admin rejects a second achievement → rejected + audit log", async () => {
    const created = await studentClient.achievement.create({
      eventName: "Lomba Menulis",
      category: "writing",
      award: "Finalis",
      level: "provinsi",
      subjects: ["Indonesian"],
    });
    expect(created.status).toBe("pending");

    const updated = await adminClient.achievement.adminReview({
      achievementId: created.id,
      status: "rejected",
      adminNote: "Sertifikat tidak terbaca",
    });
    expect(updated.status).toBe("rejected");
    expect(updated.adminNote).toBe("Sertifikat tidak terbaca");

    const [row] = await db
      .select()
      .from(achievement)
      .where(eq(achievement.id, created.id))
      .limit(1);
    expect(row!.status).toBe("rejected");

    const logs = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "achievement_rejected"),
          eq(auditLog.targetId, created.id),
        ),
      );
    expect(logs.length).toBe(1);
    expect(logs[0]!.actorId).toBe(adminId);
  });

  test("admin list filters by status", async () => {
    const approved = await adminClient.achievement.adminList({
      status: "approved",
    });
    expect(approved.length).toBe(1);
    expect(approved[0]!.id).toBe(approvedAchievementId);

    const rejected = await adminClient.achievement.adminList({
      status: "rejected",
    });
    expect(rejected.length).toBe(1);
  });
});
