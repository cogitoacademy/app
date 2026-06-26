import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { uuidPrimaryKey, user } from "./auth";
import { booking } from "./booking";

export const notification = pgTable(
  "notification",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookingId: text("booking_id").references(() => booking.id, {
      onDelete: "cascade",
    }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    severity: text("severity").notNull().default("info"),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    eventKey: text("event_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "notification_category_check",
      sql`${table.category} IN ('booking','payment','refund','schedule','achievement','system','override')`,
    ),
    check(
      "notification_severity_check",
      sql`${table.severity} IN ('info','action','critical')`,
    ),
    index("notification_userId_read_created_idx").on(
      table.userId,
      table.isRead,
      table.createdAt,
    ),
    index("notification_eventKey_idx").on(table.eventKey),
  ],
);

export const notificationDispatch = pgTable(
  "notification_dispatch",
  {
    id: uuidPrimaryKey,
    notificationId: text("notification_id")
      .notNull()
      .references(() => notification.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    check("dispatch_channel_check", sql`${table.channel} IN ('email')`),
    check(
      "dispatch_status_check",
      sql`${table.status} IN ('queued','sent','failed','suppressed')`,
    ),
    index("dispatch_notificationId_idx").on(table.notificationId),
    index("dispatch_status_idx").on(table.status),
  ],
);

export const notificationRelations = relations(
  notification,
  ({ one, many }) => ({
    user: one(user, {
      fields: [notification.userId],
      references: [user.id],
    }),
    booking: one(booking, {
      fields: [notification.bookingId],
      references: [booking.id],
    }),
    dispatches: many(notificationDispatch),
  }),
);

export const notificationDispatchRelations = relations(
  notificationDispatch,
  ({ one }) => ({
    notification: one(notification, {
      fields: [notificationDispatch.notificationId],
      references: [notification.id],
    }),
  }),
);
