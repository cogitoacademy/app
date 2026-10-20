import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidPrimaryKey, user } from "./auth";
import { booking, bookingSession, type BookingPriceSnapshot } from "./booking";
import { tutorPayout } from "./tutor-payout";
import { tutorSessionFee } from "./tutor-session-fee";

/**
 * Immutable per-session source allocation for a manually recorded tutor
 * transfer. Legacy snapshot rows are captured when a new payout is marked paid;
 * historical payout batches are intentionally not backfilled without a source
 * reconciliation.
 */
export const tutorPayoutAllocation = pgTable(
  "tutor_payout_allocation",
  {
    id: uuidPrimaryKey,
    payoutId: text("payout_id")
      .notNull()
      .references(() => tutorPayout.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    sourceType: text("source_type").notNull(),
    tutorSessionFeeId: text("tutor_session_fee_id").references(
      () => tutorSessionFee.id,
      { onDelete: "restrict" },
    ),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "restrict" }),
    bookingSessionId: text("booking_session_id").references(
      () => bookingSession.id,
      { onDelete: "restrict" },
    ),
    bookingType: text("booking_type").notNull(),
    deliveryStatus: text("delivery_status").notNull(),
    scheduledStartAt: timestamp("scheduled_start_at", {
      withTimezone: true,
    }).notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull(),
    grossHonorariumIdr: integer("gross_honorarium_idr").notNull(),
    priceSnapshot: jsonb("price_snapshot").$type<BookingPriceSnapshot>(),
    active: boolean("active").notNull().default(true),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: text("released_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    releaseReason: text("release_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "tutor_payout_allocation_source_type_check",
      sql`${table.sourceType} IN ('fee_event','legacy_booking','legacy_series_session')`,
    ),
    check(
      "tutor_payout_allocation_booking_type_check",
      sql`${table.bookingType} IN ('solo','group','series')`,
    ),
    check(
      "tutor_payout_allocation_delivery_status_check",
      sql`${table.deliveryStatus} IN ('completed','no_show')`,
    ),
    check(
      "tutor_payout_allocation_amount_check",
      sql`${table.grossHonorariumIdr} >= 0`,
    ),
    uniqueIndex("tutor_payout_allocation_source_active_uniq")
      .on(table.sourceKey)
      .where(sql`${table.active}`),
    uniqueIndex("tutor_payout_allocation_fee_active_uniq")
      .on(table.tutorSessionFeeId)
      .where(sql`${table.tutorSessionFeeId} IS NOT NULL AND ${table.active}`),
    index("tutor_payout_allocation_payout_start_idx").on(
      table.payoutId,
      table.scheduledStartAt,
    ),
  ],
);

export const tutorPayoutAllocationRelations = relations(
  tutorPayoutAllocation,
  ({ one }) => ({
    payout: one(tutorPayout, {
      fields: [tutorPayoutAllocation.payoutId],
      references: [tutorPayout.id],
    }),
    fee: one(tutorSessionFee, {
      fields: [tutorPayoutAllocation.tutorSessionFeeId],
      references: [tutorSessionFee.id],
    }),
    booking: one(booking, {
      fields: [tutorPayoutAllocation.bookingId],
      references: [booking.id],
    }),
    session: one(bookingSession, {
      fields: [tutorPayoutAllocation.bookingSessionId],
      references: [bookingSession.id],
    }),
  }),
);
