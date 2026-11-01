import { relations } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey, user } from "./auth";
import { tutorInvite } from "./tutor-invite";
import { tutorProfile } from "./tutor-profile";

/**
 * Editable specialization catalog. A row with a null parentId is a competition
 * category;
 * rows with a parentId are selectable specializations. Inactive rows are kept
 * for legacy tutor profile reads and foreign-key preservation.
 */
export const subjectCategory = pgTable(
  "subject_category",
  {
    id: uuidPrimaryKey,
    parentId: text("parent_id").references(
      (): AnyPgColumn => subjectCategory.id,
      { onDelete: "restrict" },
    ),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    nameId: text("name_id"),
    description: text("description"),
    descriptionId: text("description_id"),
    lightTextColor: text("light_text_color"),
    lightBackgroundColor: text("light_background_color"),
    darkTextColor: text("dark_text_color"),
    darkBackgroundColor: text("dark_background_color"),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "subject_category_parent_not_self_check",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    check(
      "subject_category_palette_hierarchy_check",
      sql`(${table.parentId} IS NULL AND ${table.lightTextColor} IS NOT NULL AND ${table.lightBackgroundColor} IS NOT NULL AND ${table.darkTextColor} IS NOT NULL AND ${table.darkBackgroundColor} IS NOT NULL) OR (${table.parentId} IS NOT NULL AND ${table.lightTextColor} IS NULL AND ${table.lightBackgroundColor} IS NULL AND ${table.darkTextColor} IS NULL AND ${table.darkBackgroundColor} IS NULL)`,
    ),
    uniqueIndex("subject_category_slug_uniq").on(table.slug),
    index("subject_category_parentId_idx").on(table.parentId),
    index("subject_category_active_parent_sort_idx").on(
      table.isActive,
      table.parentId,
      table.sortOrder,
    ),
  ],
);

/**
 * Normalized tutor specialization selection. Only subjectCategory rows with a
 * parentId should be inserted here; the API validates that invariant before
 * persistence.
 */
export const tutorProfileSubject = pgTable(
  "tutor_profile_subject",
  {
    id: uuidPrimaryKey,
    tutorProfileId: text("tutor_profile_id")
      .notNull()
      .references(() => tutorProfile.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjectCategory.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tutor_profile_subject_tutorProfileId_idx").on(table.tutorProfileId),
    index("tutor_profile_subject_subjectId_idx").on(table.subjectId),
    uniqueIndex("tutor_profile_subject_profile_subject_uniq").on(
      table.tutorProfileId,
      table.subjectId,
    ),
  ],
);

export const subjectCategoryRelations = relations(
  subjectCategory,
  ({ one, many }) => ({
    parent: one(subjectCategory, {
      fields: [subjectCategory.parentId],
      references: [subjectCategory.id],
      relationName: "subjectCategoryHierarchy",
    }),
    children: many(subjectCategory, {
      relationName: "subjectCategoryHierarchy",
    }),
    tutorProfileSubjects: many(tutorProfileSubject),
  }),
);

export const tutorProfileSubjectRelations = relations(
  tutorProfileSubject,
  ({ one }) => ({
    tutorProfile: one(tutorProfile, {
      fields: [tutorProfileSubject.tutorProfileId],
      references: [tutorProfile.id],
    }),
    subject: one(subjectCategory, {
      fields: [tutorProfileSubject.subjectId],
      references: [subjectCategory.id],
    }),
  }),
);

export const tutorProfileRelations = relations(
  tutorProfile,
  ({ one, many }) => ({
    user: one(user, {
      fields: [tutorProfile.userId],
      references: [user.id],
    }),
    invite: one(tutorInvite, {
      fields: [tutorProfile.inviteId],
      references: [tutorInvite.id],
    }),
    subjects: many(tutorProfileSubject),
  }),
);
