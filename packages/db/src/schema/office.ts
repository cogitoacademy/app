import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const officeOutbox = pgTable(
  "office_outbox",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (t) => [index("office_outbox_pending_idx").on(t.sentAt, t.attempts)],
);

export const officeActionReceipt = pgTable("office_action_receipt", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
});
