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
      sql`${table.provider} IN ('stub','midtrans','xendit')`,
    ),
    check(
      "payment_status_check",
      sql`${table.status} IN ('PENDING','PAID','SETTLED','FAILED','EXPIRED','REFUNDED')`,
    ),
    uniqueIndex("payment_provider_event_id_idx").on(table.providerEventId),
    index("payment_userId_idx").on(table.userId),
    index("payment_providerReference_idx").on(table.providerReference),
    index("payment_status_idx").on(table.status),
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
