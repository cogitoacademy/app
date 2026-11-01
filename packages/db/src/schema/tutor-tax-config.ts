import { relations, sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const tutorTaxConfig = pgTable(
  "tutor_tax_config",
  {
    id: text("id").primaryKey(),
    nikNpwpRateBps: integer("nik_npwp_rate_bps").notNull().default(250),
    nikOnlyRateBps: integer("nik_only_rate_bps").notNull().default(300),
    missingRateBps: integer("missing_rate_bps").notNull().default(300),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "tutor_tax_config_rates_check",
      sql`${table.nikNpwpRateBps} BETWEEN 0 AND 10000 AND ${table.nikOnlyRateBps} BETWEEN 0 AND 10000 AND ${table.missingRateBps} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const tutorTaxConfigRelations = relations(tutorTaxConfig, ({ one }) => ({
  updatedByUser: one(user, {
    fields: [tutorTaxConfig.updatedBy],
    references: [user.id],
  }),
}));
