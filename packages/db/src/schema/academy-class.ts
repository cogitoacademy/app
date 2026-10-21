import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidPrimaryKey, user } from "./auth";
import { room } from "./booking";
import { subjectCategory } from "./tutor-subject";

export const academyClass = pgTable(
  "academy_class",
  {
    id: uuidPrimaryKey,
    kind: text("kind").notNull(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => subjectCategory.id, { onDelete: "restrict" }),
    titleEn: text("title_en").notNull(),
    titleId: text("title_id"),
    descriptionEn: text("description_en").notNull(),
    descriptionId: text("description_id"),
    coverKey: text("cover_key"),
    minimumEnrollment: integer("minimum_enrollment"),
    minimumCheckAt: timestamp("minimum_check_at", { withTimezone: true }),
    cohortFullRateMarks: integer("cohort_full_rate_marks"),
    cohortHalfRateMarks: integer("cohort_half_rate_marks"),
    cohortSingleRateMarks: integer("cohort_single_rate_marks"),
    masterclassRateMarks: integer("masterclass_rate_marks"),
    tutorFeeIdr: integer("tutor_fee_idr").notNull(),
    state: text("state").notNull().default("draft"),
    postponementCount: integer("postponement_count").notNull().default(0),
    version: integer("version").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
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
      "academy_class_kind_check",
      sql`${table.kind} IN ('cohort', 'masterclass')`,
    ),
    check(
      "academy_class_state_check",
      sql`${table.state} IN ('draft', 'published', 'postponed', 'cancelled', 'completed')`,
    ),
    check("academy_class_tutor_fee_positive", sql`${table.tutorFeeIdr} > 0`),
    check(
      "academy_class_postponement_count_check",
      sql`${table.postponementCount} BETWEEN 0 AND 1`,
    ),
    check("academy_class_version_positive", sql`${table.version} > 0`),
    check(
      "academy_class_rate_shape_check",
      sql`(${table.kind} = 'cohort' AND ${table.cohortFullRateMarks} IS NOT NULL AND ${table.cohortFullRateMarks} > 0 AND ${table.cohortHalfRateMarks} IS NOT NULL AND ${table.cohortHalfRateMarks} > 0 AND ${table.cohortSingleRateMarks} IS NOT NULL AND ${table.cohortSingleRateMarks} > 0 AND ${table.masterclassRateMarks} IS NULL AND ${table.minimumEnrollment} IS NOT NULL AND ${table.minimumEnrollment} > 0 AND ${table.minimumCheckAt} IS NOT NULL) OR (${table.kind} = 'masterclass' AND ${table.cohortFullRateMarks} IS NULL AND ${table.cohortHalfRateMarks} IS NULL AND ${table.cohortSingleRateMarks} IS NULL AND ${table.masterclassRateMarks} IS NOT NULL AND ${table.masterclassRateMarks} > 0 AND ${table.minimumEnrollment} IS NULL AND ${table.minimumCheckAt} IS NULL)`,
    ),
    index("academy_class_competition_idx").on(table.competitionId),
    index("academy_class_state_start_idx").on(table.state, table.createdAt),
  ],
);

export const academyClassSession = pgTable(
  "academy_class_session",
  {
    id: uuidPrimaryKey,
    classId: text("class_id")
      .notNull()
      .references(() => academyClass.id, { onDelete: "cascade" }),
    sequenceNumber: integer("sequence_number").notNull(),
    capacity: integer("capacity").notNull(),
    titleEn: text("title_en").notNull(),
    titleId: text("title_id"),
    curriculumEn: text("curriculum_en"),
    curriculumId: text("curriculum_id"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    mode: text("mode").notNull(),
    roomId: text("room_id").references(() => room.id, { onDelete: "restrict" }),
    tutorId: text("tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    tutorFeeIdr: integer("tutor_fee_idr").notNull(),
    state: text("state").notNull().default("draft"),
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
      "academy_class_session_sequence_positive",
      sql`${table.sequenceNumber} > 0`,
    ),
    check(
      "academy_class_session_capacity_positive",
      sql`${table.capacity} > 0`,
    ),
    check(
      "academy_class_session_time_order",
      sql`${table.endAt} > ${table.startAt}`,
    ),
    check(
      "academy_class_session_mode_check",
      sql`${table.mode} IN ('online', 'in_person')`,
    ),
    check(
      "academy_class_session_room_mode_check",
      sql`(${table.mode} = 'online' AND ${table.roomId} IS NULL) OR (${table.mode} = 'in_person' AND ${table.roomId} IS NOT NULL)`,
    ),
    check("academy_class_session_fee_positive", sql`${table.tutorFeeIdr} > 0`),
    check(
      "academy_class_session_state_check",
      sql`${table.state} IN ('draft', 'scheduled', 'completed', 'cancelled')`,
    ),
    uniqueIndex("academy_class_session_class_sequence_uniq").on(
      table.classId,
      table.sequenceNumber,
    ),
    index("academy_class_session_tutor_start_idx").on(
      table.tutorId,
      table.startAt,
    ),
    index("academy_class_session_room_start_idx").on(
      table.roomId,
      table.startAt,
    ),
  ],
);

export const academyClassMeeting = pgTable(
  "academy_class_meeting",
  {
    id: uuidPrimaryKey,
    sessionId: text("session_id")
      .notNull()
      .unique()
      .references(() => academyClassSession.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("google_meet"),
    externalEventId: text("external_event_id"),
    meetingUrl: text("meeting_url"),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    errorReason: text("error_reason"),
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
      "academy_class_meeting_provider_check",
      sql`${table.provider} IN ('google_meet', 'manual')`,
    ),
    check(
      "academy_class_meeting_status_check",
      sql`${table.status} IN ('pending', 'processing', 'created', 'failed', 'cancelled')`,
    ),
    check(
      "academy_class_meeting_attempt_count_check",
      sql`${table.attemptCount} >= 0`,
    ),
    index("academy_class_meeting_retry_idx").on(
      table.status,
      table.nextRetryAt,
    ),
  ],
);

export const academyClassRelations = relations(
  academyClass,
  ({ one, many }) => ({
    competition: one(subjectCategory, {
      fields: [academyClass.competitionId],
      references: [subjectCategory.id],
    }),
    sessions: many(academyClassSession),
  }),
);

export const academyClassSessionRelations = relations(
  academyClassSession,
  ({ one }) => ({
    academyClass: one(academyClass, {
      fields: [academyClassSession.classId],
      references: [academyClass.id],
    }),
    tutor: one(user, {
      fields: [academyClassSession.tutorId],
      references: [user.id],
    }),
    room: one(room, {
      fields: [academyClassSession.roomId],
      references: [room.id],
    }),
    meeting: one(academyClassMeeting, {
      fields: [academyClassSession.id],
      references: [academyClassMeeting.sessionId],
    }),
  }),
);

export const academyClassMeetingRelations = relations(
  academyClassMeeting,
  ({ one }) => ({
    session: one(academyClassSession, {
      fields: [academyClassMeeting.sessionId],
      references: [academyClassSession.id],
    }),
  }),
);
