import { describe, expect, test } from "bun:test";
import { officeMonthRange, projectOfficePeriod } from "./office-snapshot";
import type { DashboardAnalytics } from "../admin/admin.service";

const dashboard = {
  summary: { bookings: 15, completionRate: 75, activeLearners: 8 },
  businessSummary: {
    signups: 10,
    grossReceiptsIdr: 500000,
    refundedIdr: 20000,
  },
  operationsSummary: {
    delivered: {
      privateMarks: 15,
      privateSessions: 3,
      academyMarks: 12,
      academySeatSessions: 4,
    },
    tutorFees: { earnedIdr: 120000, paidIdr: 80000, unpaidIdr: 40000 },
  },
  funnel: {
    registeredStudents: 10,
    bookedStudents: 8,
    completedStudents: 6,
    paidStudents: 4,
  },
  modalityBreakdown: [{ modality: "online", count: 15 }],
  categoryBreakdown: [{ category: "Debate", bookings: 15 }],
  supplyDemand: [{ category: "Debate", bookings: 15, activeTutors: 4 }],
  email: "seeded.person@example.com",
  name: "Seeded Person",
  token: "private-token",
  bankAccountNumber: "1234567890",
} as unknown as DashboardAnalytics;

describe("Office dashboard projection", () => {
  test("uses authoritative dashboard values without recalculating financial metrics", () => {
    const result = projectOfficePeriod(dashboard, []);
    expect(result.bookings).toBe(dashboard.summary.bookings);
    expect(result.completionRate).toBe(dashboard.summary.completionRate);
    expect(result.newSignups).toBe(dashboard.businessSummary.signups);
    expect(result.topUpReceiptsIdr).toBe(
      dashboard.businessSummary.grossReceiptsIdr,
    );
    expect(result.refundsIdr).toBe(dashboard.businessSummary.refundedIdr);
    expect(result.tutorFeesEarnedIdr).toBe(
      dashboard.operationsSummary.tutorFees.earnedIdr,
    );
    expect(result.tutorFeesPaidIdr).toBe(
      dashboard.operationsSummary.tutorFees.paidIdr,
    );
    expect(result.tutorFeesUnpaidIdr).toBe(
      dashboard.operationsSummary.tutorFees.unpaidIdr,
    );
    expect(result.funnel).toEqual({
      registered: 10,
      booked: 8,
      completed: 6,
      paidTopUp: 4,
    });
  });
  test("allowlists output rather than exposing added personal fields", () => {
    const serialized = JSON.stringify(projectOfficePeriod(dashboard, []));
    for (const privateValue of [
      "@",
      "Seeded Person",
      "private-token",
      "1234567890",
    ])
      expect(serialized).not.toContain(privateValue);
    expect(serialized).not.toContain("soloFeeIdr");
  });
  test("redacts student-written category names using the public taxonomy", () => {
    const result = projectOfficePeriod(
      {
        ...dashboard,
        categoryBreakdown: [
          {
            category: "Seeded Person email@example.com",
            bookings: 2,
            completed: 1,
          },
        ],
        supplyDemand: [
          { category: "Seeded Person", bookings: 2, activeTutors: 1 },
        ],
      },
      [],
      new Set(["Debate"]),
    );
    expect(result.topCategories).toEqual([{ name: "Other", bookings: 2 }]);
    expect(result.supplyDemand).toEqual([
      { category: "Other", demand: 2, supply: 1 },
    ]);
    expect(JSON.stringify(result)).not.toContain("Seeded Person");
    expect(JSON.stringify(result)).not.toContain("@");
  });
  test("uses WIB month and day at UTC month boundary", () => {
    expect(officeMonthRange(new Date("2026-10-31T17:00:00Z"))).toEqual({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-01",
    });
    expect(officeMonthRange(new Date("2026-10-31T16:59:59Z"))).toEqual({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
  });
  test("preserves attribution report and marks unavailable attribution null", () => {
    const sources = [
      { source: "instagram", campaign: "test", registered: 3, paidTopUp: 1 },
    ];
    expect(projectOfficePeriod(dashboard, sources).signupSources).toEqual(
      sources,
    );
    expect(projectOfficePeriod(dashboard, null).signupSources).toBeNull();
  });
});
