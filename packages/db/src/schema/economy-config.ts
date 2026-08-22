import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";

/**
 * The active Phase 0 economy parameters. There is one active row so that a
 * booking can read a consistent set of parameters and snapshot them at
 * creation time. Historical booking snapshots remain authoritative after an
 * admin changes this row.
 */
export const economyConfig = pgTable(
  "economy_config",
  {
    id: text("id").primaryKey(),
    markValueIdr: integer("mark_value_idr").notNull(),
    minTutorBaseRateIdr: integer("min_tutor_base_rate_idr").notNull(),
    onlineTutorIncrementIdr: integer("online_tutor_increment_idr").notNull(),
    offlineTutorIncrementIdr: integer("offline_tutor_increment_idr").notNull(),
    onlineCogitoBaseIdr: integer("online_cogito_base_idr").notNull(),
    onlineCogitoIncrementIdr: integer("online_cogito_increment_idr").notNull(),
    offlineCogitoBaseIdr: integer("offline_cogito_base_idr").notNull(),
    offlineCogitoIncrementIdr: integer(
      "offline_cogito_increment_idr",
    ).notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("economy_config_mark_value_positive", sql`${table.markValueIdr} > 0`),
    check(
      "economy_config_min_tutor_rate_positive",
      sql`${table.minTutorBaseRateIdr} > 0`,
    ),
    check(
      "economy_config_increments_non_negative",
      sql`${table.onlineTutorIncrementIdr} >= 0 AND ${table.offlineTutorIncrementIdr} >= 0 AND ${table.onlineCogitoIncrementIdr} >= 0 AND ${table.offlineCogitoIncrementIdr} >= 0`,
    ),
    check(
      "economy_config_take_bases_non_negative",
      sql`${table.onlineCogitoBaseIdr} >= 0 AND ${table.offlineCogitoBaseIdr} >= 0`,
    ),
  ],
);

export const economyConfigRelations = relations(economyConfig, ({ one }) => ({
  updatedByUser: one(user, {
    fields: [economyConfig.updatedBy],
    references: [user.id],
  }),
}));
