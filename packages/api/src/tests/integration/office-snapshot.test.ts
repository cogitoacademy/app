import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@cogito-app/db";
import { auditLog, booking, user } from "@cogito-app/db/schema";
import { services } from "../../services";
import { resetDatabase } from "../helpers/test-client";
import { createOfficeSnapshotService } from "../../modules/office/office-snapshot";
import { getOfficeSignupSources } from "../../modules/office/office-signup-sources";

describe("Office snapshot database contract", () => {
  const person = "OfficePrivacySentinelPerson";
  const secret = "OfficePrivacySentinelSecret";
  const studentId = crypto.randomUUID();

  beforeAll(async () => {
    // Existing harness refuses reset without the dedicated test-target guard.
    await resetDatabase();
    await db.insert(user).values({
      id: studentId,
      name: person,
      email: "office-privacy-sentinel@cogito.test",
      emailVerified: true,
      role: "student",
    });
    const start = new Date(Date.now() - 3600_000);
    const end = new Date(Date.now() - 1800_000);
    await db.insert(booking).values({
      id: crypto.randomUUID(),
      type: "solo",
      modality: "online",
      tutorId: studentId,
      proposerId: studentId,
      targetGroupSize: 1,
      confirmedHeadcount: 1,
      currentState: "completed",
      scheduledStartAt: start,
      scheduledEndAt: end,
      completedAt: end,
      originalMarks: 10,
      learningGoal: person,
      sessionTopic: {
        categoryName: person,
        categoryId: "privacy-sentinel",
        categorySlug: "privacy-sentinel",
        subcategoryId: "privacy-sentinel",
        subcategorySlug: "privacy-sentinel",
        subcategoryName: person,
      },
      priceSnapshot: {
        engine: "v3",
        v3Revision: 1,
        competition: "competition-debate",
        modality: "online",
        headcount: 1,
        perStudentMarks: 10,
        collectedMarks: 10,
        tutorHonorariumIdr: 100000,
      },
    });
    await db.insert(auditLog).values({
      actorId: studentId,
      actorType: "student",
      action: "booking_created",
      targetId: studentId,
      targetType: "booking",
      details: { name: person, token: secret },
      beforeState: { email: "office-privacy-sentinel@cogito.test" },
      afterState: { school: person },
    });
  });

  test("30d financial and operational values equal the actual admin dashboard", async () => {
    const snapshot = await createOfficeSnapshotService({
      db,
      admin: services.admin,
      pricing: services.pricing,
      referral: services.referral,
      signupSources: getOfficeSignupSources,
    }).getSnapshot();
    const admin = await services.admin.getDashboardAnalytics({ period: "30d" });
    const period = snapshot.periods["30d"];
    expect(period.bookings).toBe(admin.summary.bookings);
    expect(period.completionRate).toBe(admin.summary.completionRate);
    expect(period.newSignups).toBe(admin.businessSummary.signups);
    expect(period.topUpReceiptsIdr).toBe(
      admin.businessSummary.grossReceiptsIdr,
    );
    expect(period.refundsIdr).toBe(admin.businessSummary.refundedIdr);
    expect(period.privateMarksDelivered).toBe(
      admin.operationsSummary.delivered.privateMarks,
    );
    expect(period.academyMarksDelivered).toBe(
      admin.operationsSummary.delivered.academyMarks,
    );
    expect(period.tutorFeesEarnedIdr).toBe(
      admin.operationsSummary.tutorFees.earnedIdr,
    );
    expect(period.tutorFeesPaidIdr).toBe(
      admin.operationsSummary.tutorFees.paidIdr,
    );
    expect(period.tutorFeesUnpaidIdr).toBe(
      admin.operationsSummary.tutorFees.unpaidIdr,
    );
    expect(snapshot.accounts.total).toBe(admin.businessSummary.totalAccounts);
    expect(snapshot.queues.openTickets).toBe(admin.operationalSla.openTickets);
    expect(period.bookings).toBe(1);
    const body = JSON.stringify(snapshot);
    expect(body).not.toContain(person);
    expect(body).not.toContain(secret);
    expect(body).not.toContain("@");
    expect(body).not.toContain("tutorHonorariumIdr");
    expect(snapshot.audit[0]?.actor).toBe("system");
  });
});
