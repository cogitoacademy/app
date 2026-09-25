import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";
import { tutorInvite } from "./tutor-invite";

export type TutorEducationEntry = {
  university: string;
  degree: string;
};

export type TutorAchievement = {
  competitionName: string;
  year: number;
  awards: string[];
};

export type TutorExperience = {
  role: string;
  organization: string;
  startYear: number;
  endYear: number | null;
  description: string;
};

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
    shortBio: text("short_bio"),
    affiliation: text("affiliation"),
    achievementProofUrls: jsonb("achievement_proof_urls")
      .$type<string[]>()
      .default([]),
    experienceProofUrls: jsonb("experience_proof_urls")
      .$type<string[]>()
      .default([]),
    education: jsonb("education").$type<TutorEducationEntry[]>().default([]),
    achievements: jsonb("achievements").$type<TutorAchievement[]>().default([]),
    experiences: jsonb("experiences").$type<TutorExperience[]>().default([]),
    modality: text("modality"),
    prices: jsonb("prices").$type<Record<string, number>>(),
    baseRatesIdr:
      jsonb("base_rates_idr").$type<
        Partial<{ online: number; offline: number }>
      >(),
    onlineMaxClassSize: integer("online_max_class_size").default(6).notNull(),
    offlineMaxClassSize: integer("offline_max_class_size").default(6).notNull(),
    bankName: text("bank_name"),
    bankAccountNumber: text("bank_account_number"),
    bankAccountHolderName: text("bank_account_holder_name"),
    bankAccountOpeningCity: text("bank_account_opening_city"),
    bankAccountOwnership: text("bank_account_ownership", {
      enum: ["self", "trusted_person"],
    }),
    bankTransferDisclaimerAccepted: boolean("bank_transfer_disclaimer_accepted")
      .default(false)
      .notNull(),
    termsOfServiceAcceptedAt: timestamp("terms_of_service_accepted_at"),
    termsOfServiceVersion: text("terms_of_service_version"),
    onboardingStatus: text("onboarding_status").notNull().default("draft"),
    adminReviewNote: text("admin_review_note"),
    pendingProfileChanges: jsonb("pending_profile_changes").$type<
      Partial<{
        profileImageUrl: string;
        affiliation: string;
        education: TutorEducationEntry[];
        achievements: TutorAchievement[];
        experiences: TutorExperience[];
        subjectIds: string[];
        modality: "online" | "offline" | "both";
        baseRatesIdr: Partial<{ online: number; offline: number }>;
        prices: Record<string, number>;
        achievementProofUrls: string[];
        experienceProofUrls: string[];
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
      "tutor_profile_online_max_class_size_check",
      sql`${table.onlineMaxClassSize} BETWEEN 1 AND 6`,
    ),
    check(
      "tutor_profile_offline_max_class_size_check",
      sql`${table.offlineMaxClassSize} BETWEEN 1 AND 6`,
    ),
    check(
      "tutor_profile_bank_account_ownership_check",
      sql`${table.bankAccountOwnership} IS NULL OR ${table.bankAccountOwnership} IN ('self', 'trusted_person')`,
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
