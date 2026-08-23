import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import {
  auditLog,
  availabilitySlot,
  notification,
  tutorInvite,
  tutorProfile,
} from "@cogito-app/db/schema";

import { db } from "@cogito-app/db";
import { services } from "../../services";
import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

describe("Economy settings role safety", () => {
  let adminClient: ReturnType<typeof createTestClient>;
  let tutorClient: ReturnType<typeof createTestClient>;
  let studentClient: ReturnType<typeof createTestClient>;
  let adminId: string;
  let tutorId: string;
  let studentId: string;

  beforeAll(async () => {
    await resetDatabase();

    const admin = await signUpAndSignIn(
      "economy.admin@cogito.test",
      "Test1234!",
      "Economy Admin",
    );
    const adminContext = await createTestContext(admin.cookie);
    await setUserRole(adminContext.session!.user.id, "admin");
    adminId = adminContext.session!.user.id;
    adminClient = createTestClient(await createTestContext(admin.cookie));

    const tutor = await signUpAndSignIn(
      "economy.tutor@cogito.test",
      "Test1234!",
      "Economy Tutor",
    );
    const tutorContext = await createTestContext(tutor.cookie);
    await setUserRole(tutorContext.session!.user.id, "tutor");
    tutorId = tutorContext.session!.user.id;
    tutorClient = createTestClient(await createTestContext(tutor.cookie));

    const student = await signUpAndSignIn(
      "economy.student@cogito.test",
      "Test1234!",
      "Economy Student",
    );
    studentId = (await createTestContext(student.cookie)).session!.user.id;
    studentClient = createTestClient(await createTestContext(student.cookie));
  });

  test("admin reads and updates the active take schedule", async () => {
    const current = await adminClient.admin.getEconomySettings();
    expect(current).toMatchObject({
      markValueIdr: 5_000,
      onlineCogitoBaseIdr: 50_000,
      onlineCogitoIncrementIdr: 20_000,
      offlineCogitoBaseIdr: 90_000,
      offlineCogitoIncrementIdr: 40_000,
      version: 1,
    });

    const updated = await adminClient.admin.updateEconomySettings({
      expectedVersion: current.version,
      onlineCogitoBaseIdr: 55_000,
      onlineCogitoIncrementIdr: 25_000,
      offlineCogitoBaseIdr: 95_000,
      offlineCogitoIncrementIdr: 45_000,
    });

    expect(updated).toMatchObject({
      onlineCogitoBaseIdr: 55_000,
      onlineCogitoIncrementIdr: 25_000,
      offlineCogitoBaseIdr: 95_000,
      offlineCogitoIncrementIdr: 45_000,
      version: 2,
    });

    const audit = await db
      .select({ action: auditLog.action, targetType: auditLog.targetType })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "economy_config_updated"),
          eq(auditLog.targetType, "economy_config"),
        ),
      );
    expect(audit).toHaveLength(1);

    const tutorNotifications = await db
      .select({
        userId: notification.userId,
        category: notification.category,
        title: notification.title,
        body: notification.body,
        eventKey: notification.eventKey,
        metadata: notification.metadata,
      })
      .from(notification)
      .where(eq(notification.userId, tutorId));
    expect(tutorNotifications).toHaveLength(1);
    expect(tutorNotifications[0]).toMatchObject({
      userId: tutorId,
      category: "system",
      title: "Cogito rate updated",
      eventKey: `economy_config_updated:2:${tutorId}`,
    });
    expect(tutorNotifications[0]?.body).toContain("Online: Rp55.000 base");
    expect(tutorNotifications[0]?.metadata).toMatchObject({
      economyVersion: 2,
      offlineCogitoIncrementIdr: 45_000,
    });

    const studentNotifications = await db
      .select({ id: notification.id })
      .from(notification)
      .where(eq(notification.userId, studentId));
    expect(studentNotifications).toHaveLength(0);
  });

  test("unchanged admin writes are no-ops", async () => {
    const current = await adminClient.admin.getEconomySettings();
    const unchanged = await adminClient.admin.updateEconomySettings({
      expectedVersion: current.version,
      onlineCogitoBaseIdr: current.onlineCogitoBaseIdr,
      onlineCogitoIncrementIdr: current.onlineCogitoIncrementIdr,
      offlineCogitoBaseIdr: current.offlineCogitoBaseIdr,
      offlineCogitoIncrementIdr: current.offlineCogitoIncrementIdr,
    });

    expect(unchanged.version).toBe(current.version);

    const audit = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.action, "economy_config_updated"));
    expect(audit).toHaveLength(1);

    const tutorNotifications = await db
      .select({ id: notification.id })
      .from(notification)
      .where(eq(notification.userId, tutorId));
    expect(tutorNotifications).toHaveLength(1);
  });

  test("new bookings use the active Cogito take and snapshot it", async () => {
    const inviteId = crypto.randomUUID();
    const token = crypto.randomUUID();
    await db.insert(tutorInvite).values({
      id: inviteId,
      email: "economy.tutor@cogito.test",
      displayName: "Economy Tutor",
      token,
      status: "accepted",
      invitedBy: adminId,
      acceptedBy: tutorId,
      acceptedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await db.insert(tutorProfile).values({
      id: crypto.randomUUID(),
      userId: tutorId,
      inviteId,
      displayName: "Economy Tutor",
      shortBio: "Economy test tutor",
      credentialsSummary: "Economy test credentials",
      expertise: ["Mathematics"],
      modality: "online",
      baseRatesIdr: { online: 175_000 },
      onboardingStatus: "published",
      publishedAt: new Date(),
    });

    const scheduledStartAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    scheduledStartAt.setSeconds(0, 0);
    const scheduledEndAt = new Date(
      scheduledStartAt.getTime() + 90 * 60 * 1000,
    );
    const [slot] = await db
      .insert(availabilitySlot)
      .values({
        id: crypto.randomUUID(),
        tutorId,
        startDate: scheduledStartAt,
        endDate: scheduledEndAt,
        modality: "online",
      })
      .returning();

    const wallet = await services.wallet.getOrCreate(studentId);
    await services.wallet.credit(db, {
      walletId: wallet.id,
      amount: 100,
      eventKey: "economy.test.booking.credit",
      sourceReference: "economy-roles-test",
      actorType: "system",
      reason: "Economy role booking test balance",
    });

    const booking = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slot!.id,
      modality: "online",
      scheduledStartAt,
      learningGoal: "Verify active economy snapshot",
      timezone: "Asia/Jakarta",
    });

    expect(booking.priceSnapshot).toMatchObject({
      economyVersion: 2,
      tutorBaseRateIdr: 175_000,
      tutorHonorariumIdr: 175_000,
      cogitoBaseTakeIdr: 55_000,
      cogitoTakeIdr: 55_000,
      totalIdr: 230_000,
      totalMarks: 46,
      perStudent: 46,
      actualMarksPooled: 46,
    });
  });

  test("stale admin writes are rejected", async () => {
    await expect(
      adminClient.admin.updateEconomySettings({
        expectedVersion: 1,
        onlineCogitoBaseIdr: 50_000,
        onlineCogitoIncrementIdr: 20_000,
        offlineCogitoBaseIdr: 90_000,
        offlineCogitoIncrementIdr: 40_000,
      }),
    ).rejects.toThrow();
  });

  test("student and tutor cannot read or mutate admin economy settings", async () => {
    await expect(studentClient.admin.getEconomySettings()).rejects.toThrow();
    await expect(tutorClient.admin.getEconomySettings()).rejects.toThrow();
    await expect(
      studentClient.admin.updateEconomySettings({
        expectedVersion: 2,
        onlineCogitoBaseIdr: 50_000,
        onlineCogitoIncrementIdr: 20_000,
        offlineCogitoBaseIdr: 90_000,
        offlineCogitoIncrementIdr: 40_000,
      }),
    ).rejects.toThrow();
    await expect(
      tutorClient.admin.updateEconomySettings({
        expectedVersion: 2,
        onlineCogitoBaseIdr: 50_000,
        onlineCogitoIncrementIdr: 20_000,
        offlineCogitoBaseIdr: 90_000,
        offlineCogitoIncrementIdr: 40_000,
      }),
    ).rejects.toThrow();
  });
});
