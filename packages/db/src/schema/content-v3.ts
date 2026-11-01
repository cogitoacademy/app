import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { subjectCategory } from "./tutor-subject";

const lifecycle = () => ({
  id: text("id").primaryKey(),
  sourceId: text("source_id").unique(),
  sourceHash: text("source_hash"),
  title: text("title").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
// Private server-side metadata; never project these rows into student/calendar DTOs.
export const kbFile = pgTable(
  "kb_file",
  {
    id: text("id").primaryKey(),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("kb_file_bytes", sql`${t.bytes} > 0 AND ${t.bytes} <= 5242880`),
  ],
);
export const kbResource = pgTable(
  "kb_resource",
  {
    ...lifecycle(),
    category: text("category").notNull(),
    fileId: text("file_id")
      .notNull()
      .references(() => kbFile.id, { onDelete: "restrict" }),
  },
  (t) => [
    check(
      "kb_resource_valid",
      sql`length(trim(${t.title})) > 0 AND ${t.version} > 0 AND ${t.sortOrder} >= 0`,
    ),
  ],
);
export const calendarEvent = pgTable(
  "calendar_event",
  {
    ...lifecycle(),
    location: text("location"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    educationLevels: jsonb("education_levels").$type<string[]>().notNull(),
    scale: text("scale"),
    organizer: text("organizer"),
    registrationDeadline: timestamp("registration_deadline", {
      withTimezone: true,
    }),
    registrationLink: text("registration_link"),
    socialMediaLink: text("social_media_link"),
  },
  (t) => [
    check(
      "calendar_event_valid",
      sql`length(trim(${t.title})) > 0 AND ${t.version} > 0 AND ${t.sortOrder} >= 0 AND ${t.endDate} >= ${t.startDate}`,
    ),
  ],
);
export const calendarEventCategory = pgTable(
  "calendar_event_category",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => calendarEvent.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => subjectCategory.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.categoryId] })],
);
