import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { uuidPrimaryKey, user } from "./auth";

export const availabilitySlot = pgTable(
  "availability_slot",
  {
    id: uuidPrimaryKey,
    tutorId: text("tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    modality: text("modality").notNull(),
    isRecurring: boolean("is_recurring").default(false).notNull(),
    recurrenceRule: text("recurrence_rule"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "availability_slot_modality_check",
      sql`${table.modality} IN ('online','offline','both')`,
    ),
    index("availability_slot_tutorId_startDate_idx").on(
      table.tutorId,
      table.startDate,
    ),
    uniqueIndex("availability_slot_unique_idx").on(
      table.tutorId,
      table.startDate,
      table.endDate,
    ),
  ],
);

export const availabilitySlotRelations = relations(
  availabilitySlot,
  ({ one }) => ({
    tutor: one(user, {
      fields: [availabilitySlot.tutorId],
      references: [user.id],
    }),
  }),
);
