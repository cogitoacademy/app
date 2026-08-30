import { relations } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey, user } from "./auth";

/**
 * Immutable record of a tutor payout that an admin has confirmed as paid.
 * `cutoffAt` is the exclusive boundary for completed bookings included in
 * this payout; later completions remain pending for the next payout.
 */
export const tutorPayout = pgTable(
  "tutor_payout",
  {
    id: uuidPrimaryKey,
    tutorId: text("tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
    grossHonorariumIdr: integer("gross_honorarium_idr").notNull(),
    transferFeeIdr: integer("transfer_fee_idr").notNull().default(0),
    netHonorariumIdr: integer("net_honorarium_idr").notNull(),
    bankName: text("bank_name").notNull(),
    status: text("status").notNull().default("paid"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    paidBy: text("paid_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("tutor_payout_status_check", sql`${table.status} IN ('paid')`),
    check(
      "tutor_payout_amounts_check",
      sql`${table.grossHonorariumIdr} >= 0 AND ${table.transferFeeIdr} >= 0 AND ${table.netHonorariumIdr} >= 0`,
    ),
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
}));
