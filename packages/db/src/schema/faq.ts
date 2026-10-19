import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { uuidPrimaryKey } from "./auth";

export type FaqAnswerBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; style: "ordered" | "unordered"; items: string[] };

export const faqEntry = pgTable(
  "faq_entry",
  {
    id: uuidPrimaryKey,
    questionEn: text("question_en").notNull(),
    questionId: text("question_id"),
    answerEn: jsonb("answer_en").$type<FaqAnswerBlock[]>().notNull(),
    answerId: jsonb("answer_id").$type<FaqAnswerBlock[] | null>(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    showOnLanding: boolean("show_on_landing").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("faq_entry_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
    check("faq_entry_version_positive", sql`${table.version} > 0`),
    index("faq_entry_public_order_idx").on(
      table.isActive,
      table.sortOrder,
      table.id,
    ),
    index("faq_entry_landing_order_idx").on(
      table.isActive,
      table.showOnLanding,
      table.sortOrder,
      table.id,
    ),
  ],
);
