import { relations } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey, user } from "./auth";

/**
 * Immutable prepared basis and external transfer evidence for a tutor payout.
 * Legacy paid rows keep their original aggregate fields and nullable snapshots.
 */
export const tutorPayout = pgTable(
  "tutor_payout",
  {
    id: uuidPrimaryKey,
    tutorId: text("tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
    previewVersion: text("preview_version"),
    sourceKeys: jsonb("source_keys").$type<string[]>(),
    idempotencyKey: text("idempotency_key"),
    grossHonorariumIdr: integer("gross_honorarium_idr").notNull(),
    taxStatus: text("tax_status"),
    taxRateBps: integer("tax_rate_bps"),
    taxRateSource: text("tax_rate_source"),
    taxHonorariumIdr: integer("tax_honorarium_idr"),
    transferFeeIdr: integer("transfer_fee_idr").notNull().default(0),
    netHonorariumIdr: integer("net_honorarium_idr").notNull(),
    bankName: text("bank_name").notNull(),
    // Keep the destination details that were verified at preparation time.
    // These remain nullable for legacy aggregate-only payout rows.
    bankAccountNumber: text("bank_account_number"),
    bankAccountHolderName: text("bank_account_holder_name"),
    bankAccountOpeningCity: text("bank_account_opening_city"),
    bankAccountOwnership: text("bank_account_ownership"),
    taxLegalName: text("tax_legal_name"),
    taxNik: text("tax_nik"),
    taxNpwp: text("tax_npwp"),
    taxProfileVersion: integer("tax_profile_version"),
    taxConfigVersion: integer("tax_config_version"),
    status: text("status").notNull().default("paid"),
    actualAmountIdr: integer("actual_amount_idr"),
    actualReference: text("actual_reference"),
    actualProofUrl: text("actual_proof_url"),
    transferRecordedAt: timestamp("transfer_recorded_at", {
      withTimezone: true,
    }),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    preparedBy: text("prepared_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: text("paid_by").references(() => user.id, { onDelete: "restrict" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    voidReason: text("void_reason"),
    reconciliationStatus: text("reconciliation_status")
      .notNull()
      .default("not_required"),
    reconciliationResolvedAt: timestamp("reconciliation_resolved_at", {
      withTimezone: true,
    }),
    reconciliationResolvedBy: text("reconciliation_resolved_by").references(
      () => user.id,
      { onDelete: "restrict" },
    ),
    reconciliationReason: text("reconciliation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "tutor_payout_status_check",
      sql`${table.status} IN ('prepared', 'paid', 'void')`,
    ),
    check(
      "tutor_payout_tax_status_check",
      sql`${table.taxStatus} IS NULL OR ${table.taxStatus} IN ('nik_npwp', 'nik_only', 'missing')`,
    ),
    check(
      "tutor_payout_tax_rate_source_check",
      sql`${table.taxRateSource} IS NULL OR ${table.taxRateSource} IN ('default_nik_npwp', 'default_nik_only', 'default_missing', 'tutor_override')`,
    ),
    check(
      "tutor_payout_reconciliation_status_check",
      sql`${table.reconciliationStatus} IN ('not_required', 'required', 'resolved')`,
    ),
    check(
      "tutor_payout_amounts_check",
      sql`${table.grossHonorariumIdr} >= 0 AND ${table.transferFeeIdr} >= 0 AND ${table.netHonorariumIdr} >= 0 AND (${table.taxHonorariumIdr} IS NULL OR ${table.taxHonorariumIdr} >= 0) AND (${table.actualAmountIdr} IS NULL OR ${table.actualAmountIdr} >= 0)`,
    ),
    uniqueIndex("tutor_payout_idempotency_uniq").on(table.idempotencyKey),
    index("tutor_payout_status_paid_at_idx").on(table.status, table.paidAt),
    index("tutor_payout_tutor_cutoff_idx").on(table.tutorId, table.cutoffAt),
    index("tutor_payout_paid_at_idx").on(table.paidAt),
  ],
);

export const tutorPayoutRelations = relations(tutorPayout, ({ one }) => ({
  tutor: one(user, {
    fields: [tutorPayout.tutorId],
    references: [user.id],
  }),
  admin: one(user, {
    fields: [tutorPayout.paidBy],
    references: [user.id],
  }),
  preparer: one(user, {
    fields: [tutorPayout.preparedBy],
    references: [user.id],
  }),
}));
