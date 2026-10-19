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

  test("classifies known, unknown, malformed, and missing pricing snapshots from PostgreSQL", async () => {
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
      {
        ...commonBooking,
        id: crypto.randomUUID(),
        priceSnapshot: {
          perStudent: 10,
          baseline: 10,
          tutorShare: 7,
          cogitoTake: 3,
          baselineCogitoTake: 3,
          baselineTutorShare: 7,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      },
      {
        ...commonBooking,
        id: crypto.randomUUID(),
        priceSnapshot: null,
      },
      {
        ...commonBooking,
        id: crypto.randomUUID(),
        priceSnapshot: { engine: "future" } as any,
      },
      {
        ...commonBooking,
        id: crypto.randomUUID(),
        priceSnapshot: {} as any,
      },
    ]);

    const result = await adminClient.admin.getDashboardAnalytics({
      period: "7d",
    });

    expect(result.period).toBe("7d");
    expect(result.summary.bookings).toBe(5);
    expect(result.summary.pricingSnapshotBreakdown).toEqual({
      v3: 1,
      legacy: 1,
      other: 2,
      missing: 1,
    });
    expect(result.businessSummary.totalAccounts).toBe(1);
    expect(result.businessSummary.totalStudents).toBe(0);
  });
});
