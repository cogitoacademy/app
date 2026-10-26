import { sql } from "drizzle-orm";
import {
  check,
  index,
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { paymentRecord } from "./payment-record";
import { uuidPrimaryKey, user } from "./auth";
import { ledgerEntry } from "./wallet";

export const referralCampaign = pgTable(
  "referral_campaign",
  {
    id: uuidPrimaryKey,
    name: text("name").notNull(),
    purpose: text("purpose")
      .$type<"kol" | "promotion">()
      .notNull()
      .default("kol"),
    activationAt: timestamp("activation_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attributionWindowDays: integer("attribution_window_days").notNull(),
    flatAmountIdr: integer("flat_amount_idr").notNull().default(0),
    percentBps: integer("percent_bps").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "referral_campaign_activation_before_expiry",
      sql`${table.expiresAt} > ${table.activationAt}`,
    ),
    check(
      "referral_campaign_attribution_window_positive",
      sql`${table.attributionWindowDays} > 0 AND ${table.attributionWindowDays} <= 365`,
    ),
    check(
      "referral_campaign_terms_valid",
      sql`${table.flatAmountIdr} >= 0 AND ${table.percentBps} BETWEEN 0 AND 10000 AND ((${table.purpose} = 'kol' AND (${table.flatAmountIdr} > 0 OR ${table.percentBps} > 0)) OR (${table.purpose} = 'promotion' AND ${table.flatAmountIdr} = 0 AND ${table.percentBps} = 0))`,
    ),
    index("referral_campaign_expiry_idx").on(
      table.activationAt,
      table.expiresAt,
    ),
  ],
);

export const referralCode = pgTable(
  "referral_code",
  {
    id: uuidPrimaryKey,
    code: text("code").notNull(),
    kind: text("kind").notNull(),
    referrerUserId: text("referrer_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    campaignId: text("campaign_id").references(() => referralCampaign.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "referral_code_format",
      sql`${table.code} = upper(${table.code}) AND ${table.code} ~ '^[A-Z0-9]{4,32}$'`,
    ),
    check(
      "referral_code_kind_owner",
      sql`(${table.kind} = 'friend' AND ${table.referrerUserId} IS NOT NULL AND ${table.campaignId} IS NULL) OR (${table.kind} = 'kol' AND ${table.referrerUserId} IS NULL AND ${table.campaignId} IS NOT NULL)`,
    ),
    uniqueIndex("referral_code_value_uniq").on(table.code),
    uniqueIndex("referral_code_friend_owner_uniq")
      .on(table.referrerUserId)
      .where(sql`${table.referrerUserId} IS NOT NULL`),
    uniqueIndex("referral_code_campaign_uniq")
      .on(table.campaignId)
      .where(sql`${table.campaignId} IS NOT NULL`),
  ],
);

export const referralSettingsRevision = pgTable(
  "referral_settings_revision",
  {
    id: uuidPrimaryKey,
    version: integer("version").notNull(),
    welcomeMarks: integer("welcome_marks").notNull(),
    friendRewardMarks: integer("friend_reward_marks").notNull(),
    semesterCapMarks: integer("semester_cap_marks").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    changedBy: text("changed_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("referral_settings_version_positive", sql`${table.version} > 0`),
    check(
      "referral_settings_marks_nonnegative",
      sql`${table.welcomeMarks} >= 0 AND ${table.friendRewardMarks} >= 0 AND ${table.semesterCapMarks} >= 0`,
    ),
    uniqueIndex("referral_settings_version_uniq").on(table.version),
    index("referral_settings_effective_idx").on(table.effectiveAt),
  ],
);

export const referralChoice = pgTable(
  "referral_choice",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    codeId: text("code_id").references(() => referralCode.id, {
      onDelete: "restrict",
    }),
    codeSnapshot: text("code_snapshot"),
    referrerUserId: text("referrer_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    campaignId: text("campaign_id").references(() => referralCampaign.id, {
      onDelete: "restrict",
    }),
    welcomeMarksSnapshot: integer("welcome_marks_snapshot").notNull(),
    friendRewardMarksSnapshot: integer("friend_reward_marks_snapshot"),
    kolFlatAmountIdrSnapshot: integer("kol_flat_amount_idr_snapshot"),
    kolPercentBpsSnapshot: integer("kol_percent_bps_snapshot"),
    kolAttributionExpiresAt: timestamp("kol_attribution_expires_at", {
      withTimezone: true,
    }),
    settingsVersion: integer("settings_version").notNull(),
    welcomeLedgerEntryId: text("welcome_ledger_entry_id").references(
      () => ledgerEntry.id,
      { onDelete: "set null" },
    ),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "referral_choice_snapshot_valid",
      sql`(${table.kind} = 'none' AND ${table.codeId} IS NULL AND ${table.codeSnapshot} IS NULL AND ${table.referrerUserId} IS NULL AND ${table.campaignId} IS NULL AND ${table.welcomeMarksSnapshot} = 0 AND ${table.friendRewardMarksSnapshot} IS NULL AND ${table.kolFlatAmountIdrSnapshot} IS NULL AND ${table.kolPercentBpsSnapshot} IS NULL AND ${table.kolAttributionExpiresAt} IS NULL) OR (${table.kind} = 'friend' AND ${table.codeId} IS NOT NULL AND ${table.codeSnapshot} IS NOT NULL AND ${table.referrerUserId} IS NOT NULL AND ${table.campaignId} IS NULL AND ${table.welcomeMarksSnapshot} >= 0 AND ${table.friendRewardMarksSnapshot} IS NOT NULL AND ${table.friendRewardMarksSnapshot} >= 0 AND ${table.kolFlatAmountIdrSnapshot} IS NULL AND ${table.kolPercentBpsSnapshot} IS NULL AND ${table.kolAttributionExpiresAt} IS NULL) OR (${table.kind} = 'kol' AND ${table.codeId} IS NOT NULL AND ${table.codeSnapshot} IS NOT NULL AND ${table.referrerUserId} IS NULL AND ${table.campaignId} IS NOT NULL AND ${table.welcomeMarksSnapshot} >= 0 AND ${table.friendRewardMarksSnapshot} IS NULL AND ${table.kolFlatAmountIdrSnapshot} IS NOT NULL AND ${table.kolFlatAmountIdrSnapshot} >= 0 AND ${table.kolPercentBpsSnapshot} IS NOT NULL AND ${table.kolPercentBpsSnapshot} BETWEEN 0 AND 10000 AND ${table.kolAttributionExpiresAt} IS NOT NULL)`,
    ),
    uniqueIndex("referral_choice_user_uniq").on(table.userId),
    uniqueIndex("referral_choice_welcome_ledger_uniq")
      .on(table.welcomeLedgerEntryId)
      .where(sql`${table.welcomeLedgerEntryId} IS NOT NULL`),
    index("referral_choice_referrer_idx").on(table.referrerUserId),
    index("referral_choice_campaign_idx").on(table.campaignId),
  ],
);

export const referralSemesterUsage = pgTable(
  "referral_semester_usage",
  {
    id: uuidPrimaryKey,
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    semesterKey: text("semester_key").notNull(),
    creditedMarks: integer("credited_marks").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "referral_semester_usage_nonnegative",
      sql`${table.creditedMarks} >= 0`,
    ),
    uniqueIndex("referral_semester_usage_owner_semester_uniq").on(
      table.referrerUserId,
      table.semesterKey,
    ),
  ],
);

export const friendRewardDecision = pgTable(
  "friend_reward_decision",
  {
    id: uuidPrimaryKey,
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    choiceId: text("choice_id")
      .notNull()
      .references(() => referralChoice.id, { onDelete: "cascade" }),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    completionType: text("completion_type").notNull(),
    completionId: text("completion_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    semesterKey: text("semester_key").notNull(),
    rewardMarksSnapshot: integer("reward_marks_snapshot").notNull(),
    semesterCapMarks: integer("semester_cap_marks").notNull(),
    creditedMarks: integer("credited_marks").notNull(),
    ledgerEntryId: text("ledger_entry_id").references(() => ledgerEntry.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "friend_reward_completion_type_check",
      sql`${table.completionType} IN ('solo', 'group', 'series_child', 'cohort', 'masterclass')`,
    ),
    check(
      "friend_reward_amounts_nonnegative",
      sql`${table.rewardMarksSnapshot} >= 0 AND ${table.semesterCapMarks} >= 0 AND ${table.creditedMarks} >= 0 AND ${table.creditedMarks} <= ${table.rewardMarksSnapshot} AND ${table.creditedMarks} <= ${table.semesterCapMarks}`,
    ),
    uniqueIndex("friend_reward_referred_user_uniq").on(table.referredUserId),
    uniqueIndex("friend_reward_choice_uniq").on(table.choiceId),
    uniqueIndex("friend_reward_completion_student_uniq").on(
      table.completionType,
      table.completionId,
      table.referredUserId,
    ),
    index("friend_reward_referrer_semester_idx").on(
      table.referrerUserId,
      table.semesterKey,
    ),
  ],
);

export const kolCommissionDecision = pgTable(
  "kol_commission_decision",
  {
    id: uuidPrimaryKey,
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    choiceId: text("choice_id")
      .notNull()
      .references(() => referralChoice.id, { onDelete: "restrict" }),
    paymentId: text("payment_id")
      .notNull()
      .references(() => paymentRecord.id, { onDelete: "restrict" }),
    providerSuccessAt: timestamp("provider_success_at", {
      withTimezone: true,
    }),
    providerSuccessTimeState: text("provider_success_time_state")
      .$type<"verified" | "unresolved">()
      .notNull()
      .default("verified"),
    paymentStatusSnapshot: text("payment_status_snapshot").notNull(),
    refundReconciliationState: text("refund_reconciliation_state")
      .$type<"none" | "partial_refund">()
      .notNull()
      .default("none"),
    providerRefundAmountIdrSnapshot: integer(
      "provider_refund_amount_idr_snapshot",
    ),
    providerRefundIdentitySnapshot: text("provider_refund_identity_snapshot"),
    purchaseAmountIdrSnapshot: integer(
      "purchase_amount_idr_snapshot",
    ).notNull(),
    flatAmountIdrSnapshot: integer("flat_amount_idr_snapshot").notNull(),
    percentBpsSnapshot: integer("percent_bps_snapshot").notNull(),
    commissionAmountIdr: bigint("commission_amount_idr", {
      mode: "number",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "kol_commission_amounts_nonnegative",
      sql`${table.purchaseAmountIdrSnapshot} > 0 AND ${table.flatAmountIdrSnapshot} >= 0 AND ${table.percentBpsSnapshot} BETWEEN 0 AND 10000 AND ${table.commissionAmountIdr} >= 0`,
    ),
    check(
      "kol_commission_success_time_state_check",
      sql`${table.providerSuccessTimeState} IN ('verified', 'unresolved') AND ((${table.providerSuccessTimeState} = 'verified' AND ${table.providerSuccessAt} IS NOT NULL) OR (${table.providerSuccessTimeState} = 'unresolved' AND ${table.providerSuccessAt} IS NULL AND ${table.commissionAmountIdr} = 0))`,
    ),
    check(
      "kol_commission_payment_status_check",
      sql`${table.paymentStatusSnapshot} IN ('PENDING','PAID','SETTLED','FAILED','EXPIRED','REFUNDED')`,
    ),
    check(
      "kol_commission_refund_reconciliation_state_check",
      sql`${table.refundReconciliationState} IN ('none','partial_refund')`,
    ),
    check(
      "kol_commission_refund_amount_check",
      sql`${table.providerRefundAmountIdrSnapshot} IS NULL OR ${table.providerRefundAmountIdrSnapshot} >= 0`,
    ),
    check(
      "kol_commission_refund_identity_check",
      sql`${table.providerRefundIdentitySnapshot} IS NULL OR ${table.providerRefundIdentitySnapshot} ~ '^[a-f0-9]{64}$'`,
    ),
    uniqueIndex("kol_commission_decision_referred_user_uniq").on(
      table.referredUserId,
    ),
    uniqueIndex("kol_commission_decision_payment_uniq").on(table.paymentId),
    index("kol_commission_decision_success_idx").on(table.providerSuccessAt),
    index("kol_commission_decision_created_idx").on(
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const kolSettlementEntry = pgTable(
  "kol_settlement_entry",
  {
    id: uuidPrimaryKey,
    decisionId: text("decision_id")
      .notNull()
      .references(() => kolCommissionDecision.id, { onDelete: "restrict" }),
    operationId: text("operation_id").notNull(),
    kind: text("kind").$type<"transfer" | "adjustment">().notNull(),
    amountIdr: bigint("amount_idr", { mode: "number" }).notNull(),
    expectedObligationIdr: bigint("expected_obligation_idr", {
      mode: "number",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    reference: text("reference"),
    reason: text("reason"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("kol_settlement_operation_uniq").on(table.operationId),
    index("kol_settlement_decision_idx").on(table.decisionId),
    check(
      "kol_settlement_entry_valid",
      sql`(${table.kind} = 'transfer' AND ${table.amountIdr} > 0 AND ${table.paidAt} IS NOT NULL AND ${table.reference} IS NOT NULL AND length(trim(${table.reference})) > 0 AND ${table.reason} IS NULL) OR (${table.kind} = 'adjustment' AND ${table.amountIdr} <> 0 AND ${table.paidAt} IS NULL AND ${table.reference} IS NULL AND ${table.reason} IS NOT NULL AND length(trim(${table.reason})) >= 3)`,
    ),
  ],
);
