import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuidPrimaryKey,
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    targetType: text("target_type").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_actorId_idx").on(table.actorId),
    index("audit_log_targetType_targetId_idx").on(table.targetType, table.targetId),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_createdAt_idx").on(table.createdAt),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, {
    fields: [auditLog.actorId],
    references: [user.id],
  }),
}));