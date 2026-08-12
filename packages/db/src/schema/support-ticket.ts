import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey, user } from "./auth";
import { booking } from "./booking";

export const supportTicket = pgTable(
  "support_ticket",
  {
    id: uuidPrimaryKey,
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookingId: text("booking_id").references(() => booking.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("open"),
    slaDeadline: timestamp("sla_deadline", { withTimezone: true }).notNull(),
    assignedTo: text("assigned_to").references(() => user.id, {
      onDelete: "set null",
    }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "support_ticket_category_check",
      sql`${table.category} IN ('tutor_late','tutor_no_show','technical','payment','other')`,
    ),
    check(
      "support_ticket_status_check",
      sql`${table.status} IN ('open','in_progress','resolved','closed')`,
    ),
    index("support_ticket_reporterId_idx").on(table.reporterId),
    index("support_ticket_bookingId_idx").on(table.bookingId),
    index("support_ticket_status_sla_idx").on(table.status, table.slaDeadline),
  ],
);

export const supportTicketRelations = relations(supportTicket, ({ one }) => ({
  reporter: one(user, {
    fields: [supportTicket.reporterId],
    references: [user.id],
  }),
  booking: one(booking, {
    fields: [supportTicket.bookingId],
    references: [booking.id],
  }),
  assignee: one(user, {
    fields: [supportTicket.assignedTo],
    references: [user.id],
  }),
}));
