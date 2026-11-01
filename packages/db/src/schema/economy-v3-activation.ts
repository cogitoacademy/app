import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  text,
  timestamp,
  jsonb,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user, uuidPrimaryKey } from "./auth";
import { economyV3Revision } from "./economy-v3-revision";

/** Explicit customer-pricing pointer. Draft revisions never become active by themselves. */
export const economyV3Activation = pgTable(
  "economy_v3_activation",
  {
    id: text("id").primaryKey().default("default"),
    activeRevision: integer("active_revision").references(
      () => economyV3Revision.version,
      { onDelete: "restrict" },
    ),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("economy_v3_activation_singleton", sql`${table.id} = 'default'`),
  ],
);

/** A student's immutable 15-minute top-up offer; contains top-up terms only. */
export const economyV3TopUpQuote = pgTable(
  "economy_v3_top_up_quote",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    revision: integer("revision")
      .notNull()
      .references(() => economyV3Revision.version, { onDelete: "restrict" }),
    requestedMarks: integer("requested_marks").notNull(),
    termsSnapshot: jsonb("terms_snapshot").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("economy_v3_top_up_quote_request_idx").on(
      table.userId,
      table.requestKey,
    ),
    check(
      "economy_v3_top_up_quote_marks_positive",
      sql`${table.requestedMarks} > 0`,
    ),
    check(
      "economy_v3_top_up_quote_request_key_uuid",
      sql`${table.requestKey} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
  ],
);
