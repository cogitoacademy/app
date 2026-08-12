import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { uuidPrimaryKey, user } from "./auth";
import { wallet } from "./wallet";

export const BOOKING_STATES = [
  "awaiting_tutor_review",
  "declined",
  "reschedule_proposed",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "awaiting_participant_confirmation",
  "confirmed",
  "scheduled",
  "completed",
  "cancelled",
  "late_cancelled",
  "no_show",
  "expired",
] as const;

export const BOOKING_TYPES = ["solo", "group", "series"] as const;
export const MODALITIES = ["online", "offline"] as const;

export const booking = pgTable(
  "booking",
  {
    id: uuidPrimaryKey,
    type: text("type").notNull(),
    modality: text("modality").notNull(),
    tutorId: text("tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    proposerId: text("proposer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetGroupSize: integer("target_group_size").notNull(),
    minConfirmedHeadcount: integer("min_confirmed_headcount")
      .notNull()
      .default(1),
    confirmedHeadcount: integer("confirmed_headcount").notNull().default(0),
    currentState: text("current_state")
      .notNull()
      .default("awaiting_tutor_review"),
    previousState: text("previous_state"),
    stateReason: text("state_reason"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    scheduledStartAt: timestamp("scheduled_start_at", {
      withTimezone: true,
    }).notNull(),
    scheduledEndAt: timestamp("scheduled_end_at", {
      withTimezone: true,
    }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Jakarta"), // TODO(production-readiness): use timezone in deadline calculations instead of server time
    roomId: text("room_id"),
    priceSnapshot: jsonb("price_snapshot").$type<{
      perStudent: number;
      baseline: number;
      tutorShare: number;
      cogitoTake: number;
      baselineCogitoTake: number;
      baselineTutorShare: number;
      extraTotal: number;
      cogitoExtraTake: number;
      tutorExtraShare: number;
    }>(),
    originalMarks: integer("original_marks").notNull(),
    holdAmount: integer("hold_amount").notNull().default(0),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    version: integer("version").default(1).notNull(),
    cancellationReason: text("cancellation_reason"),
    rescheduleMeta: jsonb("reschedule_meta"),
    overrideMeta: jsonb("override_meta"),
    notificationFlags:
      jsonb("notification_flags").$type<Record<string, boolean>>(),
    seriesParentId: text("series_parent_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "booking_type_check",
      sql`${table.type} IN ('solo','group','series')`,
    ),
    check(
      "booking_modality_check",
      sql`${table.modality} IN ('online','offline')`,
    ),
    check(
      "booking_state_check",
      sql`${table.currentState} IN ('awaiting_tutor_review','declined','reschedule_proposed','awaiting_reconfirmation','awaiting_admin_room_approval','awaiting_participant_confirmation','confirmed','scheduled','completed','cancelled','late_cancelled','no_show','expired')`,
    ),
    check(
      "booking_group_size_check",
      sql`${table.targetGroupSize} BETWEEN 1 AND 6`,
    ),
    check(
      "booking_headcount_check",
      sql`${table.confirmedHeadcount} BETWEEN 0 AND ${table.targetGroupSize}`,
    ),
    check(
      "booking_end_after_start",
      sql`${table.scheduledEndAt} > ${table.scheduledStartAt}`,
    ),
    index("booking_tutorId_state_idx").on(table.tutorId, table.currentState),
    index("booking_proposerId_state_idx").on(
      table.proposerId,
      table.currentState,
    ),
    index("booking_state_deadline_idx").on(
      table.currentState,
      table.deadlineAt,
    ),
    index("idx_booking_status_deadline").on(
      table.currentState,
      table.deadlineAt,
    ),
    index("booking_seriesParentId_idx").on(table.seriesParentId),
    index("booking_scheduledStartAt_idx").on(table.scheduledStartAt),
  ],
);

export const bookingParticipant = pgTable(
  "booking_participant",
  {
    id: uuidPrimaryKey,
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    confirmationState: text("confirmation_state").notNull().default("pending"),
    heldAmount: integer("held_amount").notNull().default(0),
    heldLedgerId: text("held_ledger_id").references(() => wallet.id, {
      onDelete: "set null",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    reconfirmedAt: timestamp("reconfirmed_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnReason: text("withdrawn_reason"),
    attendanceState: text("attendance_state").default("unknown"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "booking_participant_role_check",
      sql`${table.role} IN ('proposer','invitee')`,
    ),
    check(
      "booking_participant_confirmation_check",
      sql`${table.confirmationState} IN ('pending','confirmed','declined','reconfirmed','withdrawn_pre_h2','withdrawn_post_h2','no_show')`,
    ),
    check(
      "booking_participant_attendance_check",
      sql`${table.attendanceState} IN ('present','late','absent','unknown')`,
    ),
    index("booking_participant_bookingId_idx").on(table.bookingId),
    index("booking_participant_userId_state_idx").on(
      table.userId,
      table.confirmationState,
    ),
    index("idx_booking_participant_user").on(table.userId),
    uniqueIndex("booking_participant_booking_user_uniq").on(
      table.bookingId,
      table.userId,
    ),
  ],
);

export const bookingStateHistory = pgTable(
  "booking_state_history",
  {
    id: uuidPrimaryKey,
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    reason: text("reason"),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "booking_state_history_actor_check",
      sql`${table.actorType} IN ('admin','tutor','student','system')`,
    ),
    index("booking_state_history_bookingId_idx").on(table.bookingId),
    index("booking_state_history_createdAt_idx").on(table.createdAt),
  ],
);

export const bookingRescheduleProposal = pgTable(
  "booking_reschedule_proposal",
  {
    id: uuidPrimaryKey,
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    proposedBy: text("proposed_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    proposedStartAt: timestamp("proposed_start_at", {
      withTimezone: true,
    }).notNull(),
    proposedEndAt: timestamp("proposed_end_at", {
      withTimezone: true,
    }).notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "reschedule_status_check",
      sql`${table.status} IN ('pending','accepted','rejected','expired')`,
    ),
    index("reschedule_bookingId_idx").on(table.bookingId),
  ],
);

export const bookingSession = pgTable(
  "booking_session",
  {
    id: uuidPrimaryKey,
    seriesBookingId: text("series_booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    scheduledStartAt: timestamp("scheduled_start_at", {
      withTimezone: true,
    }).notNull(),
    scheduledEndAt: timestamp("scheduled_end_at", {
      withTimezone: true,
    }).notNull(),
    currentState: text("current_state").notNull().default("scheduled"),
    holdAmount: integer("hold_amount").notNull().default(0),
    priceSnapshot: jsonb("price_snapshot").$type<{
      perStudent: number;
      baseline: number;
      tutorShare: number;
      cogitoTake: number;
      baselineCogitoTake: number;
      baselineTutorShare: number;
      extraTotal: number;
      cogitoExtraTake: number;
      tutorExtraShare: number;
    }>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "booking_session_state_check",
      sql`${table.currentState} IN ('scheduled','completed','cancelled','no_show','late_cancelled')`,
    ),
    index("booking_session_seriesBookingId_idx").on(table.seriesBookingId),
    index("booking_session_scheduledStartAt_idx").on(table.scheduledStartAt),
  ],
);

export const room = pgTable(
  "room",
  {
    id: uuidPrimaryKey,
    name: text("name").notNull(),
    location: text("location").notNull(),
    capacity: integer("capacity").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("room_isActive_idx").on(table.isActive)],
);

export const roomBooking = pgTable(
  "room_booking",
  {
    id: uuidPrimaryKey,
    roomId: text("room_id")
      .notNull()
      .references(() => room.id, { onDelete: "cascade" }),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("requested"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "room_booking_status_check",
      sql`${table.status} IN ('requested','confirmed','relocated','cancelled')`,
    ),
    index("room_booking_roomId_idx").on(table.roomId),
    index("room_booking_bookingId_idx").on(table.bookingId),
    index("room_booking_startAt_idx").on(table.startAt),
  ],
);

export const meetingEvent = pgTable(
  "meeting_event",
  {
    id: uuidPrimaryKey,
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("pending"),
    externalEventId: text("external_event_id"),
    meetingUrl: text("meeting_url"),
    attendeeEmails: jsonb("attendee_emails").$type<string[]>(),
    status: text("status").notNull().default("pending"),
    errorReason: text("error_reason"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "meeting_provider_check",
      sql`${table.provider} IN ('google_meet','manual','pending')`,
    ),
    check(
      "meeting_status_check",
      sql`${table.status} IN ('pending','created','failed','manual','cancelled')`,
    ),
    index("meeting_event_bookingId_idx").on(table.bookingId),
  ],
);

export const bookingRelations = relations(booking, ({ one, many }) => ({
  tutor: one(user, {
    fields: [booking.tutorId],
    references: [user.id],
  }),
  proposer: one(user, {
    fields: [booking.proposerId],
    references: [user.id],
  }),
  participants: many(bookingParticipant),
  stateHistory: many(bookingStateHistory),
  rescheduleProposals: many(bookingRescheduleProposal),
  roomBookings: many(roomBooking),
  meeting: one(meetingEvent, {
    fields: [booking.id],
    references: [meetingEvent.bookingId],
  }),
  seriesParent: one(booking, {
    fields: [booking.seriesParentId],
    references: [booking.id],
    relationName: "seriesParent",
  }),
  seriesChildren: many(booking, {
    relationName: "seriesParent",
  }),
  sessions: many(bookingSession),
}));

export const bookingParticipantRelations = relations(
  bookingParticipant,
  ({ one }) => ({
    booking: one(booking, {
      fields: [bookingParticipant.bookingId],
      references: [booking.id],
    }),
    user: one(user, {
      fields: [bookingParticipant.userId],
      references: [user.id],
    }),
  }),
);

export const bookingStateHistoryRelations = relations(
  bookingStateHistory,
  ({ one }) => ({
    booking: one(booking, {
      fields: [bookingStateHistory.bookingId],
      references: [booking.id],
    }),
    actor: one(user, {
      fields: [bookingStateHistory.actorId],
      references: [user.id],
    }),
  }),
);

export const bookingRescheduleProposalRelations = relations(
  bookingRescheduleProposal,
  ({ one }) => ({
    booking: one(booking, {
      fields: [bookingRescheduleProposal.bookingId],
      references: [booking.id],
    }),
    proposedBy: one(user, {
      fields: [bookingRescheduleProposal.proposedBy],
      references: [user.id],
    }),
  }),
);

export const roomRelations = relations(room, ({ many }) => ({
  bookings: many(roomBooking),
}));

export const roomBookingRelations = relations(roomBooking, ({ one }) => ({
  room: one(room, {
    fields: [roomBooking.roomId],
    references: [room.id],
  }),
  booking: one(booking, {
    fields: [roomBooking.bookingId],
    references: [booking.id],
  }),
}));

export const meetingEventRelations = relations(meetingEvent, ({ one }) => ({
  booking: one(booking, {
    fields: [meetingEvent.bookingId],
    references: [booking.id],
  }),
  createdBy: one(user, {
    fields: [meetingEvent.createdBy],
    references: [user.id],
  }),
}));

export const bookingSessionRelations = relations(bookingSession, ({ one }) => ({
  seriesBooking: one(booking, {
    fields: [bookingSession.seriesBookingId],
    references: [booking.id],
  }),
}));
