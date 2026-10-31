import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  jsonb,
  integer,
  timestamp,
  check,
  index,
} from "drizzle-orm/pg-core";
import type { FaqRichTextDocument } from "./faq";
export const activityArticle = pgTable(
  "activity_article",
  {
    id: text("id").primaryKey(),
    titleEn: text("title_en").notNull(),
    titleId: text("title_id"),
    descriptionEn: text("description_en").notNull(),
    descriptionId: text("description_id"),
    coverUrl: text("cover_url"),
    location: text("location").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    bodyEn: jsonb("body_en").$type<FaqRichTextDocument>().notNull(),
    bodyId: jsonb("body_id").$type<FaqRichTextDocument | null>(),
    state: text("state").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "activity_article_valid",
      sql`${t.state} IN ('draft','published','cancelled','postponed') AND ${t.version} > 0`,
    ),
    index("activity_article_public").on(t.state, t.startAt),
  ],
);
