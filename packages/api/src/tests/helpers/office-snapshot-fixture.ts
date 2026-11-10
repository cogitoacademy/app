import { mock } from "bun:test";
import type { createOfficeSnapshotService } from "../../modules/office/office-snapshot";
import type { DashboardAnalytics } from "../../modules/admin/admin.service";
import * as s from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";

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

// Keep the real service and Drizzle expressions; only replace database execution.
export function snapshotFixture(populated = true) {
  const now = new Date("2026-11-11T05:00:00Z");
  const past = new Date("2026-11-01T00:00:00Z");
  const future = new Date("2026-12-01T00:00:00Z");
  const rows = new Map<unknown, unknown[]>([
    [
      s.booking,
      [
        {
          id: "late",
          ref: 1,
          state: "scheduled",
          deadline: past,
          override: { overriddenAt: past.toISOString() },
        },
        {
          id: "future",
          ref: 2,
          state: "confirmed",
          deadline: future,
          override: { overriddenAt: future.toISOString() },
        },
        {
          id: "invalid",
          ref: 3,
          state: "confirmed",
          deadline: null,
          override: { overriddenAt: "invalid" },
        },
        {
          id: "missing",
          ref: 4,
          state: "confirmed",
          deadline: null,
          override: {},
        },
        {
          id: "room",
          ref: 5,
          state: "awaiting_admin_room_approval",
          deadline: future,
          override: null,
        },
      ],
    ],
    [
      s.supportTicket,
      [{ id: "ticket", state: "open", category: "payment", deadline: past }],
    ],
    [
      s.tutorProfile,
      ["draft", "pending_review", "published", "changes_requested"].map(
        (state) => ({ id: state, state }),
      ),
    ],
    [
      s.tutorInvite,
      [
        { state: "invited", expiresAt: future },
        { state: "invited", expiresAt: past },
        { state: "accepted", expiresAt: past },
        { state: "expired", expiresAt: future },
      ],
    ],
    [s.achievement, [{ id: "achievement", state: "pending" }]],
    [s.tutorPayout, [{ id: "payout", state: "prepared" }]],
    [
      s.academyClass,
      [
        {
          id: "class",
          title: "Class",
          status: "draft",
          category: "debate",
          startsAt: null,
        },
      ],
    ],
    [
      s.calendarEvent,
      [true, false].map((active) => ({
        id: String(active),
        title: "Calendar",
        active,
        categories: ["debate"],
      })),
    ],
    [
      s.subjectCategory,
      [
        { id: "root", name: "Debate", parentId: null },
        { id: "child", name: "BP", parentId: "root" },
      ],
    ],
    [s.blogArticleVersion, [{ id: "blog", title: "Blog", status: "draft" }]],
    [
      s.activityArticle,
      [{ id: "activity", title: "Activity", status: "draft" }],
    ],
    [
      s.faqEntry,
      [true, false].map((active) => ({
        id: String(active),
        question: "FAQ",
        active,
        onLanding: true,
      })),
    ],
    [
      s.kbResource,
      [true, false].map((active) => ({
        id: String(active),
        title: "KB",
        category: "debate",
        active,
      })),
    ],
    [s.knowledgeBankAccessGrant, [{ count: 3 }]],
    [s.user, [{ count: 2, lastAddedAt: past }]],
    [
      s.auditLog,
      ["office", "admin", "student"].map((actor) => ({
        at: past,
        action: "changed",
        targetType: "booking",
        targetId: "target",
        actor,
      })),
    ],
    [
      s.referralChoice,
      [
        {
          savedChoices: 4,
          codesUsed: 3,
          welcomeMarksCredited: 2,
          friendMarksCredited: 1,
        },
      ],
    ],
    [s.kolCommissionDecision, [{ month: "2026-11", count: 2, totalIdr: 5000 }]],
  ]);
  const queryLog: { table?: unknown; limit?: number }[] = [];
  const db = {
    select: () => {
      const entry: { table?: unknown; limit?: number } = {};
      queryLog.push(entry);
      const chain = {
        from(table: unknown) {
          entry.table = table;
          return chain;
        },
        where() {
          return chain;
        },
        orderBy() {
          return chain;
        },
        groupBy() {
          return chain;
        },
        limit(value: number) {
          entry.limit = value;
          return chain;
        },
        // Drizzle queries are awaitable; the fixture resolves after from() selects a table.
        // oxlint-disable-next-line unicorn/no-thenable
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(
            populated ? (rows.get(entry.table) ?? []) : [],
          ).then(resolve);
        },
      };
      return chain;
    },
    execute: mock(async () => [{ dueLast30d: 5, filedOnTime: 3, overdue: 2 }]),
  } as unknown as DbType;
  const analytics = {
    ...dashboard,
    periodStart: past.toISOString(),
    periodEnd: now.toISOString(),
    businessSummary: {
      ...dashboard.businessSummary,
      totalAccounts: 20,
      totalStudents: 15,
      totalTutors: 5,
    },
    operationsSummary: {
      ...dashboard.operationsSummary,
      upcoming: {
        privateSeatSessions: 2,
        academySeatSessions: 3,
        privateFundedMarks: 4,
        academyFundedMarks: 5,
        privateUnfundedMarks: 6,
        academyUnfundedMarks: 7,
      },
    },
    operationalSla: { openTickets: 3, dueSoonTickets: 2, breachedTickets: 1 },
  } as DashboardAnalytics;
  const admin = {
    getDashboardAnalytics: mock(
      async (
        _input: Parameters<
          Parameters<
            typeof createOfficeSnapshotService
          >[0]["admin"]["getDashboardAnalytics"]
        >[0],
      ) => analytics,
    ),
  };
  const campaign = {
    id: "active",
    code: "ACTIVE",
    createdAt: past,
    activationAt: past,
    expiresAt: future,
    retiredAt: null,
    pausedAt: null,
    attributionWindowDays: 90,
    flatAmountIdr: 1000,
    percentBps: 0,
  };
  const referral = {
    getSettings: mock(async () => ({
      welcomeMarks: 1,
      friendRewardMarks: 2,
      semesterCapMarks: 3,
    })),
    listKolCampaigns: mock(async () =>
      populated
        ? [
            campaign,
            { ...campaign, id: "retired", retiredAt: past },
            { ...campaign, id: "paused", pausedAt: past },
            { ...campaign, id: "expired", expiresAt: past },
            { ...campaign, id: "scheduled", activationAt: future },
          ]
        : [],
    ),
  } as unknown as Parameters<typeof createOfficeSnapshotService>[0]["referral"];
  return { now, past, db, admin, referral, queryLog, rows };
}
