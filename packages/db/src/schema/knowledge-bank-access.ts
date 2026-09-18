import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { uuidPrimaryKey, user } from "./auth";

/**
 * A temporary, admin-managed Knowledge Bank exception for one student.
 *
 * The grant is intentionally kept as one row per student. Removing a grant
 * deletes the live exception while the audit log keeps the historical record.
 * Expiry is evaluated at read time, so no scheduler job is required to close
 * access.
 */
export const knowledgeBankAccessGrant = pgTable(
  "knowledge_bank_access_grant",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    grantedByUserId: text("granted_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_bank_access_grant_user_id_uniq").on(table.userId),
    index("knowledge_bank_access_grant_expires_at_idx").on(table.expiresAt),
  ],
);
