import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidPrimaryKey, user } from "./auth";
import { academyClassSession } from "./academy-class";

export const academyClassSessionReport = pgTable(
  "academy_class_session_report",
  {
    id: uuidPrimaryKey,
    sessionId: text("session_id")
      .notNull()
      .references(() => academyClassSession.id, { onDelete: "restrict" }),
    deliveryTutorId: text("delivery_tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    currentActorId: text("current_actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    currentActorRole: text("current_actor_role")
      .$type<"admin" | "tutor">()
      .notNull(),
    adminReason: text("admin_reason"),
    deliveryConfirmed: boolean("delivery_confirmed").notNull(),
    discussion: jsonb("discussion").$type<string[]>().notNull(),
    strengths: jsonb("strengths").$type<string[]>().notNull(),
    improvements: jsonb("improvements").$type<string[]>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "academy_class_session_report_actor_role_check",
      sql`${table.currentActorRole} IN ('admin', 'tutor')`,
    ),
    check(
      "academy_class_session_report_admin_reason_check",
      sql`(${table.currentActorRole} = 'admin' AND length(trim(coalesce(${table.adminReason}, ''))) > 0) OR (${table.currentActorRole} = 'tutor' AND ${table.adminReason} IS NULL)`,
    ),
    check(
      "academy_class_session_report_delivery_confirmed_check",
      sql`${table.deliveryConfirmed} IS TRUE`,
    ),
    check(
      "academy_class_session_report_version_positive",
      sql`${table.version} > 0`,
    ),
    uniqueIndex("academy_class_session_report_session_uniq").on(
      table.sessionId,
    ),
    index("academy_class_session_report_delivery_tutor_idx").on(
      table.deliveryTutorId,
      table.updatedAt,
    ),
  ],
);

export const academyClassSessionReportRevision = pgTable(
  "academy_class_session_report_revision",
  {
    id: uuidPrimaryKey,
    reportId: text("report_id")
      .notNull()
      .references(() => academyClassSessionReport.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    actorRole: text("actor_role").$type<"admin" | "tutor">().notNull(),
    adminReason: text("admin_reason"),
    requestKey: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    deliveryConfirmed: boolean("delivery_confirmed").notNull(),
    discussion: jsonb("discussion").$type<string[]>().notNull(),
    strengths: jsonb("strengths").$type<string[]>().notNull(),
    improvements: jsonb("improvements").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "academy_class_session_report_revision_actor_role_check",
      sql`${table.actorRole} IN ('admin', 'tutor')`,
    ),
    check(
      "academy_class_session_report_revision_admin_reason_check",
      sql`(${table.actorRole} = 'admin' AND length(trim(coalesce(${table.adminReason}, ''))) > 0) OR (${table.actorRole} = 'tutor' AND ${table.adminReason} IS NULL)`,
    ),
    check(
      "academy_class_session_report_revision_delivery_confirmed_check",
      sql`${table.deliveryConfirmed} IS TRUE`,
    ),
    check(
      "academy_class_session_report_revision_version_positive",
      sql`${table.version} > 0`,
    ),
    uniqueIndex("academy_class_session_report_revision_version_uniq").on(
      table.reportId,
      table.version,
    ),
    uniqueIndex("academy_class_session_report_revision_request_uniq").on(
      table.reportId,
      table.requestKey,
    ),
    uniqueIndex("academy_class_session_report_revision_fingerprint_uniq").on(
      table.reportId,
      table.fingerprint,
    ),
    index("academy_class_session_report_revision_created_idx").on(
      table.reportId,
      table.createdAt,
    ),
  ],
);

export const academyClassSessionReportRelations = relations(
  academyClassSessionReport,
  ({ one, many }) => ({
    session: one(academyClassSession, {
      fields: [academyClassSessionReport.sessionId],
      references: [academyClassSession.id],
    }),
    deliveryTutor: one(user, {
      fields: [academyClassSessionReport.deliveryTutorId],
      references: [user.id],
    }),
    currentActor: one(user, {
      fields: [academyClassSessionReport.currentActorId],
      references: [user.id],
    }),
    revisions: many(academyClassSessionReportRevision),
  }),
);

export const academyClassSessionReportRevisionRelations = relations(
  academyClassSessionReportRevision,
  ({ one }) => ({
    report: one(academyClassSessionReport, {
      fields: [academyClassSessionReportRevision.reportId],
      references: [academyClassSessionReport.id],
    }),
    actor: one(user, {
      fields: [academyClassSessionReportRevision.actorId],
      references: [user.id],
    }),
  }),
);
