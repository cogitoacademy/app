import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const studentProfile = pgTable(
  "student_profile",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    phoneNumber: text("phone_number"),
    schoolName: text("school_name"),
    gradeLevel: text("grade_level"),
    parentName: text("parent_name"),
    parentPhone: text("parent_phone"),
    parentEmail: text("parent_email"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("student_profile_userId_idx").on(table.userId)],
);

export const studentProfileRelations = relations(studentProfile, ({ one }) => ({
  user: one(user, {
    fields: [studentProfile.userId],
    references: [user.id],
  }),
}));

export const userToStudentProfileRelations = relations(user, ({ one }) => ({
  studentProfile: one(studentProfile, {
    fields: [user.id],
    references: [studentProfile.userId],
  }),
}));
