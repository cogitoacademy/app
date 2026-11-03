import { describe, expect, mock, test } from "bun:test";

import {
  getFunnelAnalytics,
  getSupportSlaAnalytics,
  getSupplyDemandAnalytics,
} from "../../modules/admin/admin-health-analytics";
import type { DashboardAnalyticsQuery } from "../../modules/admin/admin.repo";

const query = {
  periodStart: new Date("2026-10-01T00:00:00.000Z"),
  periodEnd: new Date("2026-10-31T23:59:59.999Z"),
  now: new Date("2026-10-31T12:00:00.000Z"),
} as DashboardAnalyticsQuery;

function connReturning(result: unknown) {
  return { execute: mock(async () => result) } as never;
}

describe("getFunnelAnalytics", () => {
  test("maps array rows and coerces numeric strings", async () => {
    const result = await getFunnelAnalytics(
      connReturning([
        {
          registeredStudents: "10",
          bookedStudents: "6",
          completedStudents: "4",
          paidStudents: "2",
        },
      ]),
      query,
    );

    expect(result).toEqual({
      registeredStudents: 10,
      bookedStudents: 6,
      completedStudents: 4,
      paidStudents: 2,
    });
  });

  test("supports driver objects with rows and missing aggregate rows", async () => {
    const wrapped = await getFunnelAnalytics(
      connReturning({
        rows: [{ registeredStudents: 1, bookedStudents: 1 }],
      }),
      query,
    );
    expect(wrapped).toEqual({
      registeredStudents: 1,
      bookedStudents: 1,
      completedStudents: 0,
      paidStudents: 0,
    });

    const empty = await getFunnelAnalytics(connReturning({ rows: [] }), query);
    expect(empty).toEqual({
      registeredStudents: 0,
      bookedStudents: 0,
      completedStudents: 0,
      paidStudents: 0,
    });
  });

  test("falls back to zero for non-numeric counts", async () => {
    const result = await getFunnelAnalytics(
      connReturning([{ registeredStudents: "not-a-number" }]),
      query,
    );
    expect(result.registeredStudents).toBe(0);
  });
});

describe("getSupplyDemandAnalytics", () => {
  test("maps valid category rows and drops rows without a category", async () => {
    const result = await getSupplyDemandAnalytics(
      connReturning([
        { category: "Mathematics", bookings: "5", activeTutors: "2" },
        { category: 7, bookings: 2, activeTutors: 0 },
      ]),
      query,
    );

    expect(result).toEqual([
      { category: "Mathematics", bookings: 5, activeTutors: 2 },
    ]);
  });

  test("supports driver objects with rows and invalid counters", async () => {
    const result = await getSupplyDemandAnalytics(
      connReturning({
        rows: [{ category: "Other", bookings: "bad", activeTutors: null }],
      }),
      query,
    );

    expect(result).toEqual([
      { category: "Other", bookings: 0, activeTutors: 0 },
    ]);
  });
});

describe("getSupportSlaAnalytics", () => {
  test("maps array rows", async () => {
    const result = await getSupportSlaAnalytics(
      connReturning([
        { openTickets: "7", breachedTickets: "2", dueSoonTickets: "1" },
      ]),
      query,
    );

    expect(result).toEqual({
      openTickets: 7,
      breachedTickets: 2,
      dueSoonTickets: 1,
    });
  });

  test("supports driver objects, missing rows, and invalid counters", async () => {
    const wrapped = await getSupportSlaAnalytics(
      connReturning({ rows: [{ openTickets: "bad" }] }),
      query,
    );
    expect(wrapped).toEqual({
      openTickets: 0,
      breachedTickets: 0,
      dueSoonTickets: 0,
    });

    const empty = await getSupportSlaAnalytics(
      connReturning({ rows: [] }),
      query,
    );
    expect(empty).toEqual({
      openTickets: 0,
      breachedTickets: 0,
      dueSoonTickets: 0,
    });
  });
});
