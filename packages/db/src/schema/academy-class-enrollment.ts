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
import { academyClass, academyClassSession } from "./academy-class";
import { economyV3TopUpQuote } from "./economy-v3-activation";
import { paymentRecord } from "./payment-record";

export const academyClassEnrollment = pgTable(
  "academy_class_enrollment",
  {
    id: uuidPrimaryKey,
    classId: text("class_id")
      .notNull()
      .references(() => academyClass.id, { onDelete: "restrict" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    requestKey: text("request_key").notNull(),
    plan: text("plan").notNull(),
    state: text("state").notNull().default("checkout_pending"),
    sessionCount: integer("session_count").notNull(),
    firstRateMarks: integer("first_rate_marks").notNull(),
    secondRateMarks: integer("second_rate_marks"),
    firstInstallmentMarks: integer("first_installment_marks").notNull(),
    secondInstallmentMarks: integer("second_installment_marks").notNull(),
    totalMarks: integer("total_marks").notNull(),
    checkoutExpiresAt: timestamp("checkout_expires_at", {
      withTimezone: true,
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
      "academy_class_enrollment_plan_check",
      sql`${table.plan} IN ('full', 'half', 'single', 'masterclass')`,
    ),
    check(
      "academy_class_enrollment_state_check",
      sql`${table.state} IN ('checkout_pending', 'active', 'expired', 'cancelled')`,
    ),
    check(
      "academy_class_enrollment_session_count_positive",
      sql`${table.sessionCount} > 0`,
    ),
    check(
      "academy_class_enrollment_first_rate_positive",
      sql`${table.firstRateMarks} > 0`,
    ),
    check(
      "academy_class_enrollment_second_rate_positive",
      sql`${table.secondRateMarks} IS NULL OR ${table.secondRateMarks} > 0`,
    ),
    check(
      "academy_class_enrollment_amounts_positive",
      sql`${table.firstInstallmentMarks} > 0 AND ${table.secondInstallmentMarks} >= 0 AND ${table.totalMarks} = ${table.firstInstallmentMarks} + ${table.secondInstallmentMarks}`,
    ),
    check(
      "academy_class_enrollment_request_key_required",
      sql`length(trim(${table.requestKey})) > 0`,
    ),
    uniqueIndex("academy_class_enrollment_student_request_uniq").on(
      table.studentId,
      table.requestKey,
    ),
    index("academy_class_enrollment_student_state_idx").on(
      table.studentId,
      table.state,
    ),
    index("academy_class_enrollment_class_idx").on(
      table.classId,
      table.createdAt,
    ),
    index("academy_class_enrollment_checkout_expiry_idx")
      .on(table.checkoutExpiresAt)
      .where(sql`${table.state} = 'checkout_pending'`),
  ],
);

export const academyClassEnrollmentInstallment = pgTable(
  "academy_class_enrollment_installment",
  {
    id: uuidPrimaryKey,
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => academyClassEnrollment.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    rateMarks: integer("rate_marks").notNull(),
    sessionCount: integer("session_count").notNull(),
    amountMarks: integer("amount_marks").notNull(),
    state: text("state").notNull(),
    dueSessionId: text("due_session_id").references(
      () => academyClassSession.id,
      { onDelete: "restrict" },
    ),
    dueAt: timestamp("due_at", { withTimezone: true }),
    checkoutExpiresAt: timestamp("checkout_expires_at", {
      withTimezone: true,
    }),
    reminder7dProcessedAt: timestamp("reminder_7d_processed_at", {
      withTimezone: true,
    }),
    reminder7dForAt: timestamp("reminder_7d_for_at", { withTimezone: true }),
    reminder1dProcessedAt: timestamp("reminder_1d_processed_at", {
      withTimezone: true,
    }),
    reminder1dForAt: timestamp("reminder_1d_for_at", { withTimezone: true }),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
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
      "academy_class_enrollment_installment_ordinal_check",
      sql`${table.ordinal} IN (1, 2)`,
    ),
    check(
      "academy_class_enrollment_installment_rate_positive",
      sql`${table.rateMarks} > 0`,
    ),
    check(
      "academy_class_enrollment_installment_count_positive",
      sql`${table.sessionCount} > 0`,
    ),
    check(
      "academy_class_enrollment_installment_amount_positive",
      sql`${table.amountMarks} > 0 AND ${table.amountMarks} = ${table.rateMarks} * ${table.sessionCount}`,
    ),
    check(
      "academy_class_enrollment_installment_state_check",
      sql`${table.state} IN ('checkout_pending', 'pending', 'funded', 'defaulted', 'expired', 'cancelled')`,
    ),
    uniqueIndex("academy_class_enrollment_installment_ordinal_uniq").on(
      table.enrollmentId,
      table.ordinal,
    ),
    index("academy_class_enrollment_installment_due_idx")
      .on(table.state, table.dueAt)
      .where(sql`${table.state} = 'pending'`),
    index("academy_class_enrollment_installment_checkout_expiry_idx")
      .on(table.checkoutExpiresAt)
      .where(sql`${table.state} = 'checkout_pending'`),
  ],
);

export const academyClassEnrollmentAllocation = pgTable(
  "academy_class_enrollment_allocation",
  {
    id: uuidPrimaryKey,
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => academyClassEnrollment.id, { onDelete: "cascade" }),
    installmentId: text("installment_id")
      .notNull()
      .references(() => academyClassEnrollmentInstallment.id, {
        onDelete: "restrict",
      }),
    classId: text("class_id")
      .notNull()
      .references(() => academyClass.id, { onDelete: "restrict" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => academyClassSession.id, { onDelete: "restrict" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    rateMarks: integer("rate_marks").notNull(),
    state: text("state")
      .$type<
        "checkout_reserved" | "unfunded_reserved" | "funded" | "released"
      >()
      .notNull(),
    fundingEventKey: text("funding_event_key").notNull(),
    fundingSourceReference: text("funding_source_reference").notNull(),
    fundedMarks: integer("funded_marks").notNull().default(0),
    spentMarks: integer("spent_marks").notNull().default(0),
    releasedMarks: integer("released_marks").notNull().default(0),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
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
      "academy_class_enrollment_allocation_ordinal_positive",
      sql`${table.ordinal} > 0 AND ${table.sequenceNumber} > 0`,
    ),
    check(
      "academy_class_enrollment_allocation_rate_positive",
      sql`${table.rateMarks} > 0`,
    ),
    check(
      "academy_class_enrollment_allocation_state_check",
      sql`${table.state} IN ('checkout_reserved', 'unfunded_reserved', 'funded', 'released')`,
    ),
    check(
      "academy_class_enrollment_allocation_marks_check",
      sql`${table.fundedMarks} >= 0 AND ${table.fundedMarks} <= ${table.rateMarks} AND ${table.spentMarks} >= 0 AND ${table.releasedMarks} >= 0 AND ${table.spentMarks} + ${table.releasedMarks} <= ${table.fundedMarks}`,
    ),
    check(
      "academy_class_enrollment_allocation_funding_state_check",
      sql`(${table.state} = 'funded' AND ${table.fundedMarks} = ${table.rateMarks} AND ${table.fundedAt} IS NOT NULL) OR (${table.state} IN ('checkout_reserved', 'unfunded_reserved') AND ${table.fundedMarks} = 0 AND ${table.fundedAt} IS NULL AND ${table.spentMarks} = 0 AND ${table.releasedMarks} = 0) OR ${table.state} = 'released'`,
    ),
    uniqueIndex("academy_class_enrollment_allocation_session_uniq").on(
      table.enrollmentId,
      table.sessionId,
    ),
    uniqueIndex("academy_class_enrollment_allocation_ordinal_uniq").on(
      table.enrollmentId,
      table.ordinal,
    ),
    uniqueIndex("academy_class_enrollment_allocation_funding_key_uniq").on(
      table.fundingEventKey,
    ),
    uniqueIndex(
      "academy_class_enrollment_allocation_student_session_active_uniq",
    )
      .on(table.studentId, table.sessionId)
      .where(
        sql`${table.state} IN ('checkout_reserved', 'unfunded_reserved', 'funded')`,
      ),
    index("academy_class_enrollment_allocation_session_state_idx").on(
      table.sessionId,
      table.state,
    ),
    index("academy_class_enrollment_allocation_student_idx").on(
      table.studentId,
      table.classId,
      table.state,
    ),
    index("academy_class_enrollment_allocation_installment_idx").on(
      table.installmentId,
      table.state,
    ),
  ],
);

export const academyClassEnrollmentTopUpAttempt = pgTable(
  "academy_class_enrollment_top_up_attempt",
  {
    id: uuidPrimaryKey,
    installmentId: text("installment_id")
      .notNull()
      .references(() => academyClassEnrollmentInstallment.id, {
        onDelete: "cascade",
      }),
    requestKey: text("request_key").notNull(),
    requestedMarks: integer("requested_marks").notNull(),
    choice: text("choice"),
    quoteId: text("quote_id").references(() => economyV3TopUpQuote.id, {
      onDelete: "restrict",
    }),
    paymentId: text("payment_id").references(() => paymentRecord.id, {
      onDelete: "restrict",
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
      "academy_class_enrollment_topup_marks_positive",
      sql`${table.requestedMarks} > 0`,
    ),
    check(
      "academy_class_enrollment_topup_choice_check",
      sql`${table.choice} IS NULL OR ${table.choice} IN ('package', 'custom', 'recommended')`,
    ),
    uniqueIndex("academy_class_enrollment_topup_request_key_uniq").on(
      table.installmentId,
      table.requestKey,
    ),
    uniqueIndex("academy_class_enrollment_topup_quote_uniq").on(table.quoteId),
    uniqueIndex("academy_class_enrollment_topup_payment_uniq").on(
      table.paymentId,
    ),
    index("academy_class_enrollment_topup_latest_idx").on(
      table.installmentId,
      table.createdAt,
    ),
  ],
);

export const academyClassEnrollmentRelations = relations(
  academyClassEnrollment,
  ({ one, many }) => ({
    academyClass: one(academyClass, {
      fields: [academyClassEnrollment.classId],
      references: [academyClass.id],
    }),
    student: one(user, {
      fields: [academyClassEnrollment.studentId],
      references: [user.id],
    }),
    installments: many(academyClassEnrollmentInstallment),
    allocations: many(academyClassEnrollmentAllocation),
  }),
);

export const academyClassEnrollmentInstallmentRelations = relations(
  academyClassEnrollmentInstallment,
  ({ one, many }) => ({
    enrollment: one(academyClassEnrollment, {
      fields: [academyClassEnrollmentInstallment.enrollmentId],
      references: [academyClassEnrollment.id],
    }),
    allocations: many(academyClassEnrollmentAllocation),
    topUpAttempts: many(academyClassEnrollmentTopUpAttempt),
  }),
);

export const academyClassEnrollmentAllocationRelations = relations(
  academyClassEnrollmentAllocation,
  ({ one }) => ({
    enrollment: one(academyClassEnrollment, {
      fields: [academyClassEnrollmentAllocation.enrollmentId],
      references: [academyClassEnrollment.id],
    }),
    installment: one(academyClassEnrollmentInstallment, {
      fields: [academyClassEnrollmentAllocation.installmentId],
      references: [academyClassEnrollmentInstallment.id],
    }),
    academyClass: one(academyClass, {
      fields: [academyClassEnrollmentAllocation.classId],
      references: [academyClass.id],
    }),
    session: one(academyClassSession, {
      fields: [academyClassEnrollmentAllocation.sessionId],
      references: [academyClassSession.id],
    }),
    student: one(user, {
      fields: [academyClassEnrollmentAllocation.studentId],
      references: [user.id],
    }),
  }),
);

export const academyClassEnrollmentTopUpAttemptRelations = relations(
  academyClassEnrollmentTopUpAttempt,
  ({ one }) => ({
    installment: one(academyClassEnrollmentInstallment, {
      fields: [academyClassEnrollmentTopUpAttempt.installmentId],
      references: [academyClassEnrollmentInstallment.id],
    }),
    quote: one(economyV3TopUpQuote, {
      fields: [academyClassEnrollmentTopUpAttempt.quoteId],
      references: [economyV3TopUpQuote.id],
    }),
    payment: one(paymentRecord, {
      fields: [academyClassEnrollmentTopUpAttempt.paymentId],
      references: [paymentRecord.id],
    }),
  }),
);
