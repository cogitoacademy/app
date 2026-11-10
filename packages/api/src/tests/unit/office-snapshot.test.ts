import { describe, expect, mock, test } from "bun:test";
import { createOfficeSnapshotService } from "../../modules/office/office-snapshot";
import { snapshotFixture } from "../helpers/office-snapshot-fixture";
import * as s from "@cogito-app/db/schema";
import "../../modules/office/office-snapshot.test";

describe("Office snapshot query orchestration", () => {
  test("projects all operational queues and content without private service fields", async () => {
    const fixture = snapshotFixture();
    // Campaign counts use a second projection from referralChoice.
    fixture.rows.set(s.referralChoice, [
      { campaignId: "active", signups: 7, firstPaidCompletions: 2 },
    ]);
    const signupSources = mock(async (_start: Date, _end: Date) => [
      {
        source: "school",
        campaign: "Public campaign",
        registered: 3,
        paidTopUp: 1,
      },
    ]);
    const result = await createOfficeSnapshotService({
      ...fixture,
      now: () => fixture.now,
      pricing: {
        getActiveV3Config: mock(async () => ({
          version: 9,
          values: {
            packages: [{ code: "starter", marks: 10, priceIdr: 50000 }],
            exactSurchargeIdr: 1000,
            competitionRates: { debate: { soloMarks: 5 } },
          },
        })),
      } as unknown as Parameters<
        typeof createOfficeSnapshotService
      >[0]["pricing"],
      paymentMode: () => "live",
      signupSources,
    }).getSnapshot();
    expect(
      fixture.admin.getDashboardAnalytics.mock.calls.map((args) => args[0]),
    ).toEqual([
      { period: "7d" },
      { period: "30d" },
      { period: "90d" },
      { dateFrom: "2026-11-01", dateTo: "2026-11-11" },
    ]);
    expect(signupSources).toHaveBeenCalledTimes(4);
    expect(signupSources.mock.calls[0]).toEqual([fixture.past, fixture.now]);
    expect(result.queues).toEqual({
      escalatedBookings: 1,
      bookingExceptions: 4,
      tutorReviews: 1,
      achievementReviews: 1,
      payoutsWaiting: 1,
      pendingRoomApprovals: 1,
      openTickets: 3,
      ticketsDueIn4h: 2,
      ticketsBreached: 1,
    });
    expect(result.queueItems.find((item) => item.id === "late")).toMatchObject({
      urgency: "high",
      ref: "#1",
      appUrl: "https://app.cogitoacademy.id/admin-bookings",
    });
    expect(
      result.queueItems.find((item) => item.id === "future")?.urgency,
    ).toBeNull();
    expect(result.queueItems.find((item) => item.kind === "room")?.id).toBe(
      "room",
    );
    expect(
      result.queueItems.find((item) => item.kind === "ticket"),
    ).toMatchObject({ category: "payment", urgency: "high" });
    for (const kind of ["tutorReview", "achievement", "payout"])
      expect(
        result.queueItems.find((item) => item.kind === kind),
      ).toMatchObject({ urgency: null, deadlineAt: null });
    expect(result.tutors.invitations).toEqual({
      pending: 1,
      claimed: 1,
      expired: 2,
    });
    expect(result.tutors.profiles).toEqual({
      draft: 1,
      pendingReview: 1,
      published: 1,
      needsChanges: 1,
    });
    expect(result.tutors.sessionReports).toEqual({
      dueLast30d: 5,
      filedOnTime: 3,
      overdue: 2,
    });
    expect(result.upcoming).toEqual({
      privateSeatSessions: 2,
      academySeatSessions: 3,
      fundedMarks: 9,
      unfundedMarks: 13,
    });
    expect(result.classes[0]).toMatchObject({ id: "class", startsAt: null });
    expect(result.referrals.campaigns.map((item) => item.status)).toEqual([
      "active",
      "retired",
      "paused",
      "expired",
      "scheduled",
    ]);
    expect(result.referrals.campaigns[0]).toMatchObject({
      signups: 7,
      firstPaidCompletions: 2,
    });
    expect(result.referrals.campaigns[1]).toMatchObject({
      signups: 0,
      firstPaidCompletions: null,
    });
    expect(result.calendar.map((item) => item.status)).toEqual([
      "published",
      "draft",
    ]);
    expect(result.content.faq.map((item) => item.status)).toEqual([
      "published",
      "draft",
    ]);
    expect(result.content.knowledgeBank.map((item) => item.status)).toEqual([
      "published",
      "draft",
    ]);
    expect(result.content.knowledgeBankActiveGrants).toBe(3);
    expect(result.admins).toEqual({ count: 2, lastAddedAt: fixture.past });
    expect(result.audit.map((item) => item.actor)).toEqual([
      "office",
      "admin",
      "system",
    ]);
    expect(
      fixture.queryLog.find((query) => query.table === s.auditLog)?.limit,
    ).toBe(200);
    expect(result.taxonomy).toEqual([
      { group: "Debate", specializations: ["BP"] },
    ]);
    expect(result.pricing).toEqual({
      rateCardVersion: 9,
      packages: [{ name: "starter", marks: 10, priceIdr: 50000 }],
      customTopUpExtraPerMarkIdr: 1000,
      marksPerSession: [{ competition: "debate", marks: 5 }],
    });
    expect(result.system.paymentMode).toBe("live");
    expect(result.periods["7d"].topCategories).toEqual([
      { name: "Debate", bookings: 15 },
    ]);
    expect(result.periods["7d"].supplyDemand[0]?.category).toBe("Debate");
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  test("represents unavailable configuration and empty aggregates explicitly", async () => {
    const fixture = snapshotFixture(false);
    const result = await createOfficeSnapshotService({
      ...fixture,
      now: () => fixture.now,
      pricing: { getActiveV3Config: async () => null },
    }).getSnapshot();
    expect(result.system.paymentMode).toBeNull();
    expect(result.pricing).toEqual({
      rateCardVersion: null,
      packages: null,
      customTopUpExtraPerMarkIdr: null,
      marksPerSession: null,
    });
    expect(result.admins).toEqual({ count: 0, lastAddedAt: null });
    expect(result.content.knowledgeBankActiveGrants).toBe(0);
    expect(result.queueItems).toEqual([]);
    expect(result.periods["30d"].signupSources).toBeNull();
  });

  test("propagates failed dashboard queries instead of returning partial data", async () => {
    const fixture = snapshotFixture(false);
    const failure = new Error("dashboard unavailable");
    await expect(
      createOfficeSnapshotService({
        db: fixture.db,
        referral: fixture.referral,
        pricing: { getActiveV3Config: async () => null },
        admin: {
          getDashboardAnalytics: async () => {
            throw failure;
          },
        },
      }).getSnapshot(),
    ).rejects.toBe(failure);
  });
});
