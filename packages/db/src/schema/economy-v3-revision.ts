import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  jsonb,
  text,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Append-only proposed configurations; saving does not activate customer pricing. */
export const economyV3Revision = pgTable(
  "economy_v3_revision",
  {
    version: integer("version").primaryKey(),
    values: jsonb("values").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("economy_v3_revision_version_positive", sql`${table.version} > 0`),
    check(
      "economy_v3_revision_reason_required",
      sql`length(trim(${table.reason})) > 0`,
    ),
  ],
);
