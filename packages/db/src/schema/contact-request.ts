import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { uuidPrimaryKey, user } from "./auth";
import { booking } from "./booking";

export const CONTACT_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "declined",
] as const;

export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];

/**
 * A one-way request to exchange contact details after a completed shared
 * booking. The email is never copied into notifications; `emailShared` only
 * records the recipient's explicit consent for the requester-facing read.
 */
export const contactRequest = pgTable(
  "contact_request",
  {
    id: uuidPrimaryKey,
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    message: text("message"),
    status: text("status")
      .$type<ContactRequestStatus>()
      .notNull()
      .default("pending"),
    emailShared: boolean("email_shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "contact_request_status_check",
      sql`${table.status} IN ('pending','accepted','declined')`,
    ),
    check(
      "contact_request_distinct_users_check",
      sql`${table.requesterId} <> ${table.recipientId}`,
    ),
    uniqueIndex("contact_request_booking_pair_uniq").on(
      table.bookingId,
      table.requesterId,
      table.recipientId,
    ),
    index("contact_request_recipient_status_idx").on(
      table.recipientId,
      table.status,
    ),
    index("contact_request_requester_status_idx").on(
      table.requesterId,
      table.status,
    ),
    index("contact_request_booking_idx").on(table.bookingId),
  ],
);
