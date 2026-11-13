import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import * as s from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { AdminService, DashboardAnalytics } from "../admin/admin.service";
import type { PricingPort } from "../pricing/pricing.service";
import type { ReferralService } from "../referral/referral.service";
import {
  OFFICE_OPEN_BOOKING_STATES,
  officeEscalationDeadline,
} from "./office-contract";
import { FAQ_CATEGORY_KEYS, FAQ_CATEGORY_LABELS } from "../faq/faq-categories";

export type OfficeSignupSource = {
  source: string;
  campaign: string;
  registered: number;
  paidTopUp: number;
};

/** Explicit projection: never spread dashboard/service DTOs into the Office response. */
export function projectOfficePeriod(
  a: DashboardAnalytics,
  signupSources: OfficeSignupSource[] | null,
  publicCategories: ReadonlySet<string> = new Set(),
) {
  return {
    bookings: a.summary.bookings,
    completionRate: a.summary.completionRate,
    activeProposers: a.summary.activeLearners,
    newSignups: a.businessSummary.signups,
    topUpReceiptsIdr: a.businessSummary.grossReceiptsIdr,
    refundsIdr: a.businessSummary.refundedIdr,
    privateMarksDelivered: a.operationsSummary.delivered.privateMarks,
    privateSessions: a.operationsSummary.delivered.privateSessions,
    academyMarksDelivered: a.operationsSummary.delivered.academyMarks,
    academySeatSessions: a.operationsSummary.delivered.academySeatSessions,
    tutorFeesEarnedIdr: a.operationsSummary.tutorFees.earnedIdr,
    tutorFeesPaidIdr: a.operationsSummary.tutorFees.paidIdr,
    tutorFeesUnpaidIdr: a.operationsSummary.tutorFees.unpaidIdr,
    funnel: {
      registered: a.funnel.registeredStudents,
      booked: a.funnel.bookedStudents,
      completed: a.funnel.completedStudents,
      paidTopUp: a.funnel.paidStudents,
    },
    formats: a.modalityBreakdown.map((r) => ({
      format: r.modality,
      bookings: r.count,
    })),
    topCategories: a.categoryBreakdown.map((r) => ({
      name: publicCategories.has(r.category) ? r.category : "Other",
      bookings: r.bookings,
    })),
    supplyDemand: a.supplyDemand.map((r) => ({
      category: publicCategories.has(r.category) ? r.category : "Other",
      demand: r.bookings,
      supply: r.activeTutors,
    })),
    signupSources,
  };
}

export function officeMonthRange(now: Date) {
  const wib = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  return { dateFrom: `${wib.slice(0, 7)}-01`, dateTo: wib };
}

export function createOfficeSnapshotService(deps: {
  db: DbType;
  admin: Pick<AdminService, "getDashboardAnalytics">;
  pricing: Pick<PricingPort, "getActiveV3Config">;
  referral: Pick<ReferralService, "getSettings" | "listKolCampaigns">;
  signupSources?: (start: Date, end: Date) => Promise<OfficeSignupSource[]>;
  now?: () => Date;
  paymentMode?: () => "sandbox" | "live" | null;
  campaignLabels?: Readonly<Record<string, string>>;
}) {
  const { db } = deps;
  return {
    async getSnapshot() {
      const now = deps.now?.() ?? new Date();
      const [d7, d30, d90, month, rateCard, settings, campaigns] =
        await Promise.all([
          deps.admin.getDashboardAnalytics({ period: "7d" }),
          deps.admin.getDashboardAnalytics({ period: "30d" }),
          deps.admin.getDashboardAnalytics({ period: "90d" }),
          deps.admin.getDashboardAnalytics(officeMonthRange(now)),
          deps.pricing.getActiveV3Config(),
          deps.referral.getSettings(),
          deps.referral.listKolCampaigns(),
        ]);
      const [
        bookings,
        tickets,
        profiles,
        invites,
        achievements,
        payouts,
        classes,
        calendar,
        categories,
        blog,
        activities,
        faq,
        knowledge,
        grants,
        admins,
        audit,
        referralTotals,
        commissions,
        blogCategories,
      ] = await Promise.all([
        db
          .select({
            id: s.booking.id,
            ref: s.booking.bookingNumber,
            state: s.booking.currentState,
            deadline: s.booking.deadlineAt,
            override: s.booking.overrideMeta,
          })
          .from(s.booking)
          .where(
            inArray(s.booking.currentState, [...OFFICE_OPEN_BOOKING_STATES]),
          ),
        db
          .select({
            id: s.supportTicket.id,
            state: s.supportTicket.status,
            category: s.supportTicket.category,
            deadline: s.supportTicket.slaDeadline,
          })
          .from(s.supportTicket)
          .where(inArray(s.supportTicket.status, ["open", "in_progress"])),
        db
          .select({
            id: s.tutorProfile.id,
            state: s.tutorProfile.onboardingStatus,
          })
          .from(s.tutorProfile),
        db
          .select({
            state: s.tutorInvite.status,
            expiresAt: s.tutorInvite.expiresAt,
          })
          .from(s.tutorInvite),
        db
          .select({ id: s.achievement.id, state: s.achievement.status })
          .from(s.achievement)
          .where(eq(s.achievement.status, "pending")),
        db
          .select({ id: s.tutorPayout.id, state: s.tutorPayout.status })
          .from(s.tutorPayout)
          .where(eq(s.tutorPayout.status, "prepared")),
        db
          .select({
            id: s.academyClass.id,
            title: s.academyClass.titleEn,
            status: s.academyClass.state,
            category: s.academyClass.competitionId,
            startsAt: sql<Date | null>`(select min(start_at) from academy_class_session where class_id = ${s.academyClass.id})`,
          })
          .from(s.academyClass)
          .where(inArray(s.academyClass.state, ["draft", "published"])),
        db
          .select({
            id: s.calendarEvent.id,
            title: s.calendarEvent.title,
            scale: s.calendarEvent.scale,
            registrationDeadline: s.calendarEvent.registrationDeadline,
            startDate: s.calendarEvent.startDate,
            endDate: s.calendarEvent.endDate,
            location: s.calendarEvent.location,
            organizer: s.calendarEvent.organizer,
            educationLevels: s.calendarEvent.educationLevels,
            registrationLink: s.calendarEvent.registrationLink,
            socialMediaLink: s.calendarEvent.socialMediaLink,
            active: s.calendarEvent.isActive,
            categories: sql<
              string[]
            >`coalesce((select json_agg(category_id) from calendar_event_category where event_id = ${s.calendarEvent.id}), '[]'::json)`,
          })
          .from(s.calendarEvent)
          .where(
            and(
              lte(
                s.calendarEvent.startDate,
                new Date(now.getTime() + 180 * 86400_000),
              ),
              gte(
                s.calendarEvent.endDate,
                new Date(now.getTime() - 30 * 86400_000),
              ),
            ),
          ),
        db
          .select({
            id: s.subjectCategory.id,
            name: s.subjectCategory.name,
            parentId: s.subjectCategory.parentId,
          })
          .from(s.subjectCategory)
          .where(eq(s.subjectCategory.isActive, true)),
        db
          .select({
            id: s.blogArticleVersion.articleId,
            title: s.blogArticleVersion.title,
            lang: s.blogArticleVersion.locale,
            status: s.blogArticleVersion.status,
            updatedAt: s.blogArticleVersion.updatedAt,
          })
          .from(s.blogArticleVersion),
        db
          .select({
            id: s.activityArticle.id,
            title: s.activityArticle.titleEn,
            status: s.activityArticle.state,
            date: s.activityArticle.startAt,
          })
          .from(s.activityArticle),
        db
          .select({
            id: s.faqEntry.id,
            question: s.faqEntry.questionEn,
            active: s.faqEntry.isActive,
            onLanding: s.faqEntry.showOnLanding,
          })
          .from(s.faqEntry),
        db
          .select({
            id: s.kbResource.id,
            title: s.kbResource.title,
            category: s.kbResource.category,
            active: s.kbResource.isActive,
          })
          .from(s.kbResource),
        db
          .select({ count: count() })
          .from(s.knowledgeBankAccessGrant)
          .where(gte(s.knowledgeBankAccessGrant.expiresAt, now)),
        db
          .select({
            count: count(),
            lastAddedAt: sql<Date | null>`(select max(created_at) from audit_log where action = 'user_role_changed' and after_state->>'role' = 'admin')`,
          })
          .from(s.user)
          .where(eq(s.user.role, "admin")),
        db
          .select({
            at: s.auditLog.createdAt,
            action: s.auditLog.action,
            targetType: s.auditLog.targetType,
            targetId: s.auditLog.targetId,
            actor: s.auditLog.actorType,
          })
          .from(s.auditLog)
          .orderBy(desc(s.auditLog.createdAt))
          .limit(200),
        db
          .select({
            savedChoices: count(),
            codesUsed: sql<number>`count(${s.referralChoice.codeId})::int`,
            welcomeMarksCredited: sql<number>`coalesce(sum(case when ${s.referralChoice.welcomeLedgerEntryId} is not null then ${s.referralChoice.welcomeMarksSnapshot} else 0 end),0)::int`,
            friendMarksCredited: sql<number>`(select coalesce(sum(credited_marks),0)::int from friend_reward_decision)`,
          })
          .from(s.referralChoice),
        db
          .select({
            month: sql<string>`to_char(${s.kolCommissionDecision.createdAt} at time zone 'Asia/Jakarta','YYYY-MM')`,
            count: count(),
            totalIdr: sql<number>`coalesce(sum(${s.kolCommissionDecision.commissionAmountIdr}),0)::float8`,
          })
          .from(s.kolCommissionDecision)
          .groupBy(
            sql`to_char(${s.kolCommissionDecision.createdAt} at time zone 'Asia/Jakarta','YYYY-MM')`,
          ),
        db
          .select({
            id: s.blogCategory.id,
            label: s.blogCategory.titleId,
            parentId: s.blogCategory.parentId,
          })
          .from(s.blogCategory)
          .where(eq(s.blogCategory.isActive, true)),
      ]);
      const period = async (a: DashboardAnalytics) =>
        projectOfficePeriod(
          a,
          deps.signupSources
            ? await deps.signupSources(
                new Date(a.periodStart),
                new Date(a.periodEnd),
              )
            : null,
          new Set(categories.map((r) => r.name)),
        );
      const [p7, p30, p90, pm] = await Promise.all([
        period(d7),
        period(d30),
        period(d90),
        period(month),
      ]);
      // Reporting uses the first daily reminder (24h after session end) as the filing deadline.
      const reportSummary = await db.execute(sql`
        WITH sessions AS (
          SELECT b.scheduled_end_at AS ended_at, min(f.created_at) AS filed_at
          FROM booking b LEFT JOIN session_completion_feedback f ON f.booking_id = b.id AND f.session_id IS NULL
          WHERE b.type IN ('solo','group') AND b.current_state IN ('scheduled','completed')
          GROUP BY b.id
          UNION ALL
          SELECT bs.scheduled_end_at, min(f.created_at)
          FROM booking_session bs JOIN booking b ON b.id = bs.series_booking_id
          LEFT JOIN session_completion_feedback f ON f.session_id = bs.id
          WHERE b.type = 'series' AND bs.current_state IN ('scheduled','completed') GROUP BY bs.id
          UNION ALL
          SELECT cs.end_at, min(r.created_at)
          FROM academy_class_session cs JOIN academy_class c ON c.id = cs.class_id
          LEFT JOIN academy_class_session_report r ON r.session_id = cs.id
          WHERE c.state IN ('published','postponed','cancelled','completed') AND cs.state IN ('scheduled','completed') GROUP BY cs.id
        )
        SELECT count(*) FILTER (WHERE ended_at >= ${d30.periodStart}::timestamptz AND ended_at <= ${now.toISOString()}::timestamptz)::int AS "dueLast30d",
          count(*) FILTER (WHERE ended_at >= ${d30.periodStart}::timestamptz AND ended_at <= ${now.toISOString()}::timestamptz AND filed_at <= ended_at + interval '24 hours')::int AS "filedOnTime",
          count(*) FILTER (WHERE filed_at IS NULL AND ended_at + interval '24 hours' <= ${now.toISOString()}::timestamptz)::int AS overdue
        FROM sessions
      `);
      const sessionReports = reportSummary[0] as {
        dueLast30d: number;
        filedOnTime: number;
        overdue: number;
      };
      const exceptions = bookings.filter((b) => b.override !== null);
      const escalated = exceptions.filter((b) =>
        officeEscalationDeadline(b.state, b.override, now),
      );
      const queueItem = (
        kind: string,
        id: string,
        state: string,
        path: string,
        deadlineAt: Date | null = null,
        category: string | null = null,
        ref: string | null = null,
      ) => ({
        kind,
        id,
        ref,
        state,
        category,
        urgency: deadlineAt && deadlineAt <= now ? "high" : null,
        deadlineAt,
        appUrl: `https://app.cogitoacademy.id/${path}`,
      });
      const reviewProfiles = profiles.filter(
        (p) => p.state === "pending_review",
      );
      const rooms = bookings.filter(
        (b) => b.state === "awaiting_admin_room_approval",
      );
      const b = d30.businessSummary;
      const u = d30.operationsSummary.upcoming;
      const campaignCounts = await db
        .select({
          campaignId: s.referralChoice.campaignId,
          signups: count(),
          // KOL decisions record top-ups; first-completion decisions exist only for friend referrals.
          firstPaidCompletions: sql<number>`null::int`,
        })
        .from(s.referralChoice)
        .groupBy(s.referralChoice.campaignId);
      return {
        generatedAt: now.toISOString(),
        system: { paymentMode: deps.paymentMode?.() ?? null, apiVersion: "v3" },
        queues: {
          escalatedBookings: escalated.length,
          bookingExceptions: exceptions.length,
          tutorReviews: reviewProfiles.length,
          achievementReviews: achievements.length,
          payoutsWaiting: payouts.length,
          pendingRoomApprovals: rooms.length,
          openTickets: d30.operationalSla.openTickets,
          ticketsDueIn4h: d30.operationalSla.dueSoonTickets,
          ticketsBreached: d30.operationalSla.breachedTickets,
        },
        queueItems: [
          ...exceptions.map((r) =>
            queueItem(
              "booking",
              r.id,
              r.state,
              `admin-operations/bookings/${encodeURIComponent(r.id)}`,
              r.deadline,
              null,
              `#${r.ref}`,
            ),
          ),
          ...rooms.map((r) =>
            queueItem(
              "room",
              r.id,
              r.state,
              `admin-operations/bookings/${encodeURIComponent(r.id)}`,
              r.deadline,
              null,
              `#${r.ref}`,
            ),
          ),
          ...tickets.map((r) =>
            queueItem(
              "ticket",
              r.id,
              r.state,
              "admin-operations?operationsTab=support",
              r.deadline,
              r.category,
            ),
          ),
          ...reviewProfiles.map((r) =>
            queueItem(
              "tutorReview",
              r.id,
              r.state,
              `admin-tutors/${encodeURIComponent(r.id)}`,
            ),
          ),
          ...achievements.map((r) =>
            queueItem("achievement", r.id, r.state, "admin-achievements"),
          ),
          ...payouts.map((r) =>
            queueItem("payout", r.id, r.state, "admin-tutor-payouts"),
          ),
        ],
        accounts: {
          total: b.totalAccounts,
          students: b.totalStudents,
          tutors: b.totalTutors,
          monthlyActive: b.monthlyActiveUsers,
          inactive: b.inactiveUsers,
          churnPct: b.churnRate,
          studentsHoldingMarksPct: b.studentsWithMarksRate,
          paidConversionPct: b.paidConversionRate,
        },
        periods: { "7d": p7, "30d": p30, "90d": p90, thisMonth: pm },
        upcoming: {
          privateSeatSessions: u.privateSeatSessions,
          academySeatSessions: u.academySeatSessions,
          fundedMarks: u.privateFundedMarks + u.academyFundedMarks,
          unfundedMarks: u.privateUnfundedMarks + u.academyUnfundedMarks,
        },
        tutors: {
          invitations: {
            pending: invites.filter(
              (r) => r.state === "invited" && r.expiresAt > now,
            ).length,
            claimed: invites.filter((r) => r.state === "accepted").length,
            expired: invites.filter(
              (r) =>
                r.state === "expired" ||
                (r.state === "invited" && r.expiresAt <= now),
            ).length,
          },
          profiles: {
            draft: profiles.filter((r) => r.state === "draft").length,
            pendingReview: reviewProfiles.length,
            published: profiles.filter((r) => r.state === "published").length,
            needsChanges: profiles.filter(
              (r) => r.state === "changes_requested",
            ).length,
          },
          sessionReports,
        },
        classes: classes.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          category: r.category,
          startsAt: r.startsAt,
          appUrl: `https://app.cogitoacademy.id/admin-academy-classes`,
        })),
        referrals: {
          settings: {
            welcomeMarks: settings.welcomeMarks,
            friendReward: settings.friendRewardMarks,
            semesterCap: settings.semesterCapMarks,
          },
          totals: referralTotals[0],
          campaigns: campaigns.map((r) => ({
            code: r.code,
            status: r.retiredAt
              ? "retired"
              : r.pausedAt
                ? "paused"
                : r.expiresAt <= now
                  ? "expired"
                  : r.activationAt > now
                    ? "scheduled"
                    : "active",
            createdAt: r.createdAt,
            terms: {
              activationAt: r.activationAt,
              expiresAt: r.expiresAt,
              attributionWindowDays: r.attributionWindowDays,
              flatAmountIdr: r.flatAmountIdr,
              percentBps: r.percentBps,
            },
            signups:
              campaignCounts.find((c) => c.campaignId === r.id)?.signups ?? 0,
            firstPaidCompletions:
              campaignCounts.find((c) => c.campaignId === r.id)
                ?.firstPaidCompletions ?? null,
          })),
          commissions,
        },
        calendar: calendar.map((r) => ({
          id: r.id,
          title: r.title,
          categories: r.categories,
          scale: r.scale,
          registrationDeadline: r.registrationDeadline,
          startDate: r.startDate,
          endDate: r.endDate,
          location: r.location,
          organizer: r.organizer,
          educationLevels: r.educationLevels,
          registrationLink: r.registrationLink,
          socialMediaLink: r.socialMediaLink,
          status: r.active ? "published" : "draft",
        })),
        pricing: {
          rateCardVersion: rateCard?.version ?? null,
          packages:
            rateCard?.values.packages.map((p) => ({
              name: p.code,
              marks: p.marks,
              priceIdr: p.priceIdr,
            })) ?? null,
          customTopUpExtraPerMarkIdr:
            rateCard?.values.exactSurchargeIdr ?? null,
          marksPerSession: rateCard
            ? Object.entries(rateCard.values.competitionRates).map(
                ([competition, r]) => ({ competition, marks: r.soloMarks }),
              )
            : null,
        },
        referenceData: {
          competitions: categories.map((r) => ({
            id: r.id,
            label: r.name,
            parentId: r.parentId,
          })),
          blogCategories,
          faqCategories: FAQ_CATEGORY_KEYS.map((id) => ({
            id,
            label: FAQ_CATEGORY_LABELS[id].en,
          })),
          campaigns: Object.entries(deps.campaignLabels ?? {}).map(
            ([id, label]) => ({ id, label }),
          ),
        },
        taxonomy: categories
          .filter((r) => r.parentId === null)
          .map((r) => ({
            group: r.name,
            specializations: categories
              .filter((c) => c.parentId === r.id)
              .map((c) => c.name),
          })),
        content: {
          blog,
          activities,
          faq: faq.map((r) => ({
            id: r.id,
            question: r.question,
            status: r.active ? "published" : "draft",
            onLanding: r.onLanding,
          })),
          knowledgeBank: knowledge.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            status: r.active ? "published" : "draft",
          })),
          knowledgeBankActiveGrants: grants[0]?.count ?? 0,
        },
        admins: {
          count: admins[0]?.count ?? 0,
          lastAddedAt: admins[0]?.lastAddedAt ?? null,
        },
        audit: audit.map((r) => ({
          at: r.at,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          actor:
            r.actor === "office"
              ? "office"
              : r.actor === "admin"
                ? "admin"
                : "system",
        })),
      };
    },
  };
}

export async function getOfficeSnapshot() {
  const [{ db }, { services }, { env }] = await Promise.all([
    import("../../lib/db"),
    import("../../services"),
    import("@cogito-app/env/server"),
  ]);
  const { getOfficeSignupSources } = await import("./office-signup-sources");
  const snapshot = await createOfficeSnapshotService({
    db,
    admin: services.admin,
    pricing: services.pricing,
    referral: services.referral,
    signupSources: getOfficeSignupSources,
    campaignLabels: env.OFFICE_CAMPAIGN_LABELS,
    paymentMode: () =>
      env.PAYMENT_PROVIDER === "midtrans"
        ? env.MIDTRANS_MODE === "live"
          ? "live"
          : "sandbox"
        : null,
  }).getSnapshot();
  const [calendar, resources] = await Promise.all([
    env.CC_SOURCE === "sanity" ? services.content.listCompetitions() : null,
    env.KB_SOURCE === "sanity" ? services.content.listStudentResources() : null,
  ]);
  const now = new Date(snapshot.generatedAt).getTime();
  return {
    ...snapshot,
    calendar: calendar
      ? calendar
          .filter(
            (r) =>
              new Date(r.startDate).getTime() <= now + 180 * 86400_000 &&
              new Date(r.endDate).getTime() >= now - 30 * 86400_000,
          )
          .map((r) => ({
            id: r.id,
            title: r.title,
            categories: r.categories.map((c) => c.id),
            scale: r.scale,
            registrationDeadline: r.registrationDeadline,
            startDate: r.startDate,
            endDate: r.endDate,
            location: r.location,
            organizer: r.organizer,
            educationLevels: r.educationLevels,
            registrationLink: r.registrationLink,
            socialMediaLink: r.socialMediaLink,
            status: "published",
          }))
      : snapshot.calendar,
    content: {
      ...snapshot.content,
      knowledgeBank: resources
        ? resources.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            status: "published",
          }))
        : snapshot.content.knowledgeBank,
    },
  };
}
