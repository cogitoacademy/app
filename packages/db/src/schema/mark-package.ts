import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

import { uuidPrimaryKey } from "./auth";

export const markPackage = pgTable("mark_package", {
  id: uuidPrimaryKey,
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  marks: integer("marks").notNull(),
  priceIdr: integer("price_idr").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
