import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@cogito-app/db";
import { booking } from "@cogito-app/db/schema";

import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
  type TestClient,
} from "../helpers/test-client";

describe("Admin dashboard analytics", () => {
  let adminClient: TestClient;
  let adminId: string;

  beforeAll(async () => {
    await resetDatabase();

    const auth = await signUpAndSignIn(
      `analytics.admin.${Date.now()}@cogito.test`,
      "Test1234!",
      "Analytics Admin",
    );
    const context = await createTestContext(auth.cookie);
    await setUserRole(context.session!.user!.id, "admin");
    adminId = context.session!.user!.id;
    adminClient = createTestClient(await createTestContext(auth.cookie));
  });

  test("returns current V3 dashboard sections without retired pricing-engine diagnostics", async () => {
    const now = new Date();
    const scheduledStartAt = new Date(now.getTime() + 60 * 60 * 1000);
    const scheduledEndAt = new Date(
      scheduledStartAt.getTime() + 60 * 60 * 1000,
    );
    const commonBooking = {
      type: "solo",
      modality: "online",
      tutorId: adminId,
      proposerId: adminId,
      targetGroupSize: 1,
      confirmedHeadcount: 1,
      currentState: "scheduled",
      scheduledStartAt,
      scheduledEndAt,
      originalMarks: 10,
      createdAt: now,
    };

    await db.insert(booking).values([
      {
        ...commonBooking,
        id: crypto.randomUUID(),
        priceSnapshot: {
          engine: "v3",
          v3Revision: 1,
          competition: "usaco",
          modality: "online",
          headcount: 1,
          perStudentMarks: 10,
          collectedMarks: 10,
          tutorHonorariumIdr: 100_000,
        },
      },
    ]);

    const result = await adminClient.admin.getDashboardAnalytics({
      period: "7d",
    });

    expect(result.period).toBe("7d");
    expect(result.summary.bookings).toBe(1);
    expect(result.operationsSummary.upcoming.privateSeatSessions).toBe(0);
    expect(result.operationsSummary.tutorFees.earnedIdr).toBe(0);
    expect(result.businessSummary.grossReceiptsIdr).toBe(0);
    expect(result.businessSummary.totalAccounts).toBe(1);
    expect(result.businessSummary.totalStudents).toBe(0);
  });
});
