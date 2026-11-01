import { relations, sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { uuidPrimaryKey, user } from "./auth";
import { booking, bookingSession, type BookingPriceSnapshot } from "./booking";
import { academyClassSession } from "./academy-class";

/**
 * Immutable gross tutor entitlement created atomically when a booked session
 * is completed. Payout allocation and transfer state are tracked separately.
 */
export const tutorSessionFee = pgTable(
  "tutor_session_fee",
  {
    id: uuidPrimaryKey,
    bookingId: text("booking_id").references(() => booking.id, {
      onDelete: "restrict",
    }),
    bookingSessionId: text("booking_session_id").references(
      () => bookingSession.id,
      { onDelete: "restrict" },
    ),
    academyClassSessionId: text("academy_class_session_id").references(
      () => academyClassSession.id,
      { onDelete: "restrict" },
    ),
    deliveryLabel: text("delivery_label"),
    collectedMarks: integer("collected_marks").notNull().default(0),
    tutorId: text("tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    scheduledStartAt: timestamp("scheduled_start_at", {
      withTimezone: true,
    }).notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull(),
    eventKey: text("event_key").notNull(),
    grossHonorariumIdr: integer("gross_honorarium_idr").notNull(),
    priceSnapshot: jsonb("price_snapshot").$type<BookingPriceSnapshot>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "tutor_session_fee_source_identity_check",
      sql`(${table.bookingId} IS NOT NULL AND ${table.academyClassSessionId} IS NULL) OR (${table.bookingId} IS NULL AND ${table.bookingSessionId} IS NULL AND ${table.academyClassSessionId} IS NOT NULL)`,
    ),
    check(
      "tutor_session_fee_amount_nonnegative",
      sql`${table.grossHonorariumIdr} >= 0`,
    ),
    check(
      "tutor_session_fee_collected_marks_nonnegative",
      sql`${table.collectedMarks} >= 0`,
    ),
    uniqueIndex("tutor_session_fee_event_key_uniq").on(table.eventKey),
    uniqueIndex("tutor_session_fee_booking_uniq")
      .on(table.bookingId)
      .where(sql`${table.bookingSessionId} IS NULL`),
    uniqueIndex("tutor_session_fee_session_uniq")
      .on(table.bookingSessionId)
      .where(sql`${table.bookingSessionId} IS NOT NULL`),
    uniqueIndex("tutor_session_fee_class_session_uniq")
      .on(table.academyClassSessionId)
      .where(sql`${table.academyClassSessionId} IS NOT NULL`),
    index("tutor_session_fee_tutor_earned_idx").on(
      table.tutorId,
      table.earnedAt,
    ),
  ],
);

export const tutorSessionFeeRelations = relations(
  tutorSessionFee,
  ({ one }) => ({
    booking: one(booking, {
      fields: [tutorSessionFee.bookingId],
      references: [booking.id],
    }),
    session: one(bookingSession, {
      fields: [tutorSessionFee.bookingSessionId],
      references: [bookingSession.id],
    }),
    academyClassSession: one(academyClassSession, {
      fields: [tutorSessionFee.academyClassSessionId],
      references: [academyClassSession.id],
    }),
    tutor: one(user, {
      fields: [tutorSessionFee.tutorId],
      references: [user.id],
    }),
  }),
);
