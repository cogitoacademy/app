import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { uuidPrimaryKey, user } from "./auth";
import { wallet } from "./wallet";
import { markPackage } from "./mark-package";

export const paymentRecord = pgTable(
  "payment_record",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),
    packageId: text("package_id").references(() => markPackage.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    providerReference: text("provider_reference").notNull(),
    providerEventId: text("provider_event_id"),
    // X1: the provider-side payment-request id (Xendit `pr-...`), used to
    // initiate provider refunds. Populated when the 2024-11-11 createIntent
    // response carries an id.
    providerRequestId: text("provider_request_id"),
    // H4: the provider checkout URL, persisted so a PENDING re-purchase can
    // return the stored URL instead of re-calling the provider.
    checkoutUrl: text("checkout_url"),
    amountIdr: integer("amount_idr").notNull(),
    marks: integer("marks").notNull(),
    status: text("status").notNull().default("PENDING"),
    receiptUrl: text("receipt_url"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "payment_provider_check",
      sql`${table.provider} IN ('stub','xendit')`,
    ),
    check(
      "payment_status_check",
      sql`${table.status} IN ('PENDING','PAID','SETTLED','FAILED','EXPIRED','REFUNDED')`,
    ),
    uniqueIndex("payment_provider_event_id_idx").on(table.providerEventId),
    index("payment_userId_idx").on(table.userId),
    // B6: the provider reference is the idempotency key — a unique index
    // (not just an index) prevents concurrent check-then-insert races from
    // creating zombie PENDING rows.
    uniqueIndex("payment_provider_reference_idx").on(table.providerReference),
    index("payment_status_idx").on(table.status),
    index("payment_userId_status_idx").on(table.userId, table.status),
  ],
);

export const refundRecord = pgTable(
  "refund_record",
  {
    id: uuidPrimaryKey,
    paymentId: text("payment_id").references(() => paymentRecord.id, {
      onDelete: "cascade",
    }),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),
    providerReference: text("provider_reference"),
    providerEventId: text("provider_event_id"),
    amountIdr: integer("amount_idr").notNull(),
    marks: integer("marks").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("refund_provider_event_id_idx").on(table.providerEventId),
    index("refund_paymentId_idx").on(table.paymentId),
  ],
);

export const paymentRecordRelations = relations(
  paymentRecord,
  ({ one, many }) => ({
    user: one(user, {
      fields: [paymentRecord.userId],
      references: [user.id],
    }),
    wallet: one(wallet, {
      fields: [paymentRecord.walletId],
      references: [wallet.id],
    }),
    package: one(markPackage, {
      fields: [paymentRecord.packageId],
      references: [markPackage.id],
    }),
    refunds: many(refundRecord),
  }),
);

export const refundRecordRelations = relations(refundRecord, ({ one }) => ({
  payment: one(paymentRecord, {
    fields: [refundRecord.paymentId],
    references: [paymentRecord.id],
  }),
  wallet: one(wallet, {
    fields: [refundRecord.walletId],
    references: [wallet.id],
  }),
}));
