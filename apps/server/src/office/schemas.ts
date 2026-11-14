import { z } from "zod";
import { officeKolResultSchema } from "@cogito-app/api/modules/office/office-contract";
import {
  eventFields,
  resourceFields,
} from "@cogito-app/api/modules/content-admin/content-admin.types";
import { activityFields } from "@cogito-app/api/modules/activity/activity.types";
import { blogVersionFieldsSchema } from "@cogito-app/api/modules/blog/blog.types";
import { createFaqInput } from "@cogito-app/api/modules/faq/faq.types";

const text = z.string();
const number = z.number();
const instant = z.iso.datetime({ offset: true });
const nullableText = text.nullable();
const nullableInstant = instant.nullable();
const lookup = z.object({ id: text, label: text });
const category = lookup.extend({ parentId: nullableText });
const row = { id: text, version: number };
// These blocks are derived from rich text; one paragraph may contain multiple 5k runs.
const faqAnswerOutput = z.array(
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("paragraph"), text }),
    z.object({
      type: z.literal("list"),
      style: z.enum(["ordered", "unordered"]),
      items: z.array(text),
    }),
  ]),
);

export const officeErrorSchema = z.object({
  ok: z.literal(false),
  code: text,
  message: text,
});

export const officeActionResultSchemas = {
  "referrals.createKolCampaign": officeKolResultSchema,
  "referrals.retireKolCampaign": officeKolResultSchema,
  "calendar.saveDraft": eventFields.safeExtend(row).loose(),
  "calendar.publish": eventFields.safeExtend(row).loose(),
  "blog.saveDraft": blogVersionFieldsSchema
    .extend({
      ...row,
      articleId: text,
      locale: z.enum(["id", "en"]),
      status: z.enum(["draft", "published"]),
      readingMinutes: number,
      publishedAt: nullableInstant,
      updatedAt: instant,
    })
    .loose(),
  "blog.publish": blogVersionFieldsSchema
    .extend({
      ...row,
      articleId: text,
      locale: z.enum(["id", "en"]),
      status: z.enum(["draft", "published"]),
      readingMinutes: number,
      publishedAt: nullableInstant,
      updatedAt: instant,
    })
    .loose(),
  "activities.saveDraft": activityFields
    .extend({ ...row, updatedAt: instant })
    .loose(),
  "activities.publish": activityFields
    .extend({ ...row, updatedAt: instant })
    .loose(),
  "faq.saveDraft": createFaqInput
    .extend({
      ...row,
      questionEn: text,
      questionId: nullableText,
      answerEn: faqAnswerOutput,
      answerId: faqAnswerOutput.nullable(),
      modifiedAt: instant,
    })
    .loose(),
  "faq.publish": createFaqInput
    .extend({
      ...row,
      questionEn: text,
      questionId: nullableText,
      answerEn: faqAnswerOutput,
      answerId: faqAnswerOutput.nullable(),
      modifiedAt: instant,
    })
    .loose(),
  "knowledge.addDraft": resourceFields.extend(row).loose(),
};

const period = z.object({
  bookings: number,
  completionRate: number,
  activeProposers: number,
  newSignups: number,
  topUpReceiptsIdr: number,
  refundsIdr: number,
  privateMarksDelivered: number,
  privateSessions: number,
  academyMarksDelivered: number,
  academySeatSessions: number,
  tutorFeesEarnedIdr: number,
  tutorFeesPaidIdr: number,
  tutorFeesUnpaidIdr: number,
  funnel: z.object({
    registered: number,
    booked: number,
    completed: number,
    paidTopUp: number,
  }),
  formats: z.array(z.object({ format: text, bookings: number })),
  topCategories: z.array(z.object({ name: text, bookings: number })),
  supplyDemand: z.array(
    z.object({ category: text, demand: number, supply: number }),
  ),
  signupSources: z
    .array(
      z.object({
        source: text,
        campaign: text,
        registered: number,
        paidTopUp: number,
      }),
    )
    .nullable(),
});

export const officeSnapshotSchema = z.object({
  generatedAt: instant,
  system: z.object({
    paymentMode: z.enum(["sandbox", "live"]).nullable(),
    apiVersion: text,
  }),
  queues: z.object({
    escalatedBookings: number,
    bookingExceptions: number,
    tutorReviews: number,
    achievementReviews: number,
    payoutsWaiting: number,
    pendingRoomApprovals: number,
    openTickets: number,
    ticketsDueIn4h: number,
    ticketsBreached: number,
  }),
  queueItems: z.array(
    z.object({
      kind: z.enum([
        "booking",
        "ticket",
        "room",
        "tutorReview",
        "achievement",
        "payout",
      ]),
      id: text,
      ref: nullableText,
      state: text,
      category: nullableText,
      urgency: nullableText,
      deadlineAt: nullableInstant,
      appUrl: z.url(),
    }),
  ),
  accounts: z.object({
    total: number,
    students: number,
    tutors: number,
    monthlyActive: number,
    inactive: number,
    churnPct: number,
    studentsHoldingMarksPct: number,
    paidConversionPct: number,
  }),
  periods: z.object({
    "7d": period,
    "30d": period,
    "90d": period,
    thisMonth: period,
  }),
  upcoming: z.object({
    privateSeatSessions: number,
    academySeatSessions: number,
    fundedMarks: number,
    unfundedMarks: number,
  }),
  tutors: z.object({
    invitations: z.object({
      pending: number,
      claimed: number,
      expired: number,
    }),
    profiles: z.object({
      draft: number,
      pendingReview: number,
      published: number,
      needsChanges: number,
    }),
    sessionReports: z.object({
      dueLast30d: number,
      filedOnTime: number,
      overdue: number,
    }),
  }),
  classes: z.array(
    z.object({
      id: text,
      title: text,
      status: text,
      category: nullableText,
      startsAt: nullableInstant,
      appUrl: z.url(),
    }),
  ),
  referrals: z.object({
    settings: z.object({
      welcomeMarks: number,
      friendReward: number,
      semesterCap: number,
    }),
    totals: z.object({
      savedChoices: number,
      codesUsed: number,
      welcomeMarksCredited: number,
      friendMarksCredited: number,
    }),
    campaigns: z.array(
      z.object({
        code: text,
        status: text,
        createdAt: instant,
        terms: officeKolResultSchema.pick({
          activationAt: true,
          expiresAt: true,
          welcomeMarks: true,
          attributionWindowDays: true,
          flatAmountIdr: true,
          percentBps: true,
        }),
        signups: number,
        firstPaidCompletions: number.nullable(),
      }),
    ),
    commissions: z.array(
      z.object({ month: text, count: number, totalIdr: number }),
    ),
  }),
  calendar: z.array(
    z.object({
      id: text,
      title: text,
      categories: z.array(text),
      scale: nullableText,
      registrationDeadline: nullableInstant,
      startDate: instant,
      endDate: instant,
      location: nullableText,
      organizer: nullableText,
      educationLevels: z.array(text),
      registrationLink: nullableText,
      socialMediaLink: nullableText,
      status: text,
    }),
  ),
  pricing: z.object({
    rateCardVersion: number.nullable(),
    packages: z
      .array(z.object({ name: text, marks: number, priceIdr: number }))
      .nullable(),
    customTopUpExtraPerMarkIdr: number.nullable(),
    marksPerSession: z
      .array(z.object({ competition: text, marks: number }))
      .nullable(),
  }),
  taxonomy: z.array(z.object({ group: text, specializations: z.array(text) })),
  referenceData: z.object({
    competitions: z.array(category),
    blogCategories: z.array(category),
    faqCategories: z.array(lookup),
    campaigns: z.array(lookup),
  }),
  content: z.object({
    blog: z.array(
      z.object({
        id: text,
        title: text,
        lang: z.enum(["id", "en"]),
        status: text,
        updatedAt: instant,
      }),
    ),
    activities: z.array(
      z.object({ id: text, title: text, status: text, date: instant }),
    ),
    faq: z.array(
      z.object({
        id: text,
        question: text,
        status: text,
        onLanding: z.boolean(),
      }),
    ),
    knowledgeBank: z.array(
      z.object({ id: text, title: text, category: text, status: text }),
    ),
    knowledgeBankActiveGrants: number,
  }),
  admins: z.object({ count: number, lastAddedAt: nullableInstant }),
  audit: z.array(
    z.object({
      at: instant,
      action: text,
      targetType: text,
      targetId: nullableText,
      actor: z.enum(["admin", "system", "office"]),
    }),
  ),
});

export function officeJsonSchema(
  schema: z.ZodType,
  io: "input" | "output" = "input",
) {
  return z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io,
    unrepresentable: "any",
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema._zod.def.type === "date") {
        jsonSchema.type = "string";
        jsonSchema.format = "date-time";
      }
    },
  });
}
