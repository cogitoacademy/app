import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";
import { tutorInvite } from "./tutor-invite";

export const tutorProfile = pgTable(
  "tutor_profile",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    inviteId: text("invite_id")
      .notNull()
      .references(() => tutorInvite.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    shortBio: text("short_bio"),
    credentialsSummary: text("credentials_summary"),
    expertise: jsonb("expertise").$type<string[]>().default([]),
    modality: text("modality"),
    prices: jsonb("prices").$type<Record<string, number>>(),
    baseRatesIdr:
      jsonb("base_rates_idr").$type<
        Partial<{ online: number; offline: number }>
      >(),
    availabilitySummary: text("availability_summary"),
    proofUrls: jsonb("proof_urls").$type<string[]>().default([]),
    onboardingStatus: text("onboarding_status").notNull().default("draft"),
    adminReviewNote: text("admin_review_note"),
    pendingProfileChanges: jsonb("pending_profile_changes").$type<
      Partial<{
        displayName: string;
        credentialsSummary: string;
        expertise: string[];
        subjectIds: string[];
        modality: "online" | "offline" | "both";
        baseRatesIdr: Partial<{ online: number; offline: number }>;
        prices: Record<string, number>;
        proofUrls: string[];
      }>
    >(),
    profileEditStatus: text("profile_edit_status").notNull().default("none"),
    profileEditAdminNote: text("profile_edit_admin_note"),
    publishedAt: timestamp("published_at"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "tutor_profile_modality_check",
      sql`${table.modality} IS NULL OR ${table.modality} IN ('online', 'offline', 'both')`,
    ),
    check(
      "tutor_profile_onboarding_status_check",
      sql`${table.onboardingStatus} IN ('draft', 'pending_review', 'changes_requested', 'approved_unpublished', 'published', 'suspended')`,
    ),
    check(
      "tutor_profile_edit_status_check",
      sql`${table.profileEditStatus} IN ('none', 'pending_review', 'changes_requested')`,
    ),
    index("tutor_profile_userId_idx").on(table.userId),
    index("tutor_profile_onboardingStatus_idx").on(table.onboardingStatus),
    index("tutor_profile_inviteId_idx").on(table.inviteId),
    index("idx_tutor_profile_status_published").on(
      table.onboardingStatus,
      table.publishedAt,
    ),
  ],
);

export const userToTutorProfileRelations = relations(user, ({ one }) => ({
  tutorProfile: one(tutorProfile, {
    fields: [user.id],
    references: [tutorProfile.userId],
  }),
}));
