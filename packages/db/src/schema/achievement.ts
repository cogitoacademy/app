import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  date,
  jsonb,
  integer,
  index,
  check,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey } from "./auth";

import { user } from "./auth";

export const achievement = pgTable(
  "achievement",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    category: text("category").notNull(),
    award: text("award").notNull(),
    level: text("level").notNull(),
    // U10 (FR-18): issuer/institution + visibility flag for public surfacing.
    issuer: text("issuer"),
    visibility: boolean("visibility").notNull().default(true),
    eventDate: date("event_date"),
    location: text("location"),
    description: text("description"),
    subjects: jsonb("subjects").$type<string[]>().default([]),
    imageUrl: text("image_url"),
    status: text("status").notNull().default("pending"),
    adminNote: text("admin_note"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "achievement_status_check",
      sql`${table.status} IN ('draft', 'pending', 'pending_review', 'approved', 'rejected', 'archived')`,
    ),
    check(
      "achievement_category_check",
      sql`${table.category} IN ('competition','award','certificate','leadership','publication','other')`,
    ),
    index("achievement_userId_idx").on(table.userId),
    index("achievement_status_idx").on(table.status),
  ],
);

export const achievementRelations = relations(achievement, ({ one }) => ({
  user: one(user, {
    fields: [achievement.userId],
    references: [user.id],
  }),
}));
