import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";
import { sql } from "drizzle-orm";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuidPrimaryKey,
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    targetType: text("target_type").notNull(),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "audit_log_actor_type_check",
      sql`${table.actorType} IN ('admin', 'tutor', 'student', 'system')`,
    ),
    index("audit_log_actorId_idx").on(table.actorId),
    index("audit_log_targetType_targetId_idx").on(
      table.targetType,
      table.targetId,
    ),
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
