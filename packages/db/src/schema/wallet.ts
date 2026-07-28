import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { uuidPrimaryKey, user } from "./auth";

export const wallet = pgTable(
  "wallet",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    totalBalance: integer("total_balance").default(0).notNull(),
    heldBalance: integer("held_balance").default(0).notNull(),
    availableBalance: integer("available_balance").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    check(
      "wallet_balance_invariant",
      sql`${table.totalBalance} = ${table.heldBalance} + ${table.availableBalance}`,
    ),
    index("wallet_userId_idx").on(table.userId),
  ],
);

export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: uuidPrimaryKey,
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),
    bookingId: text("booking_id"),
    eventKey: text("event_key").notNull(),
    entryType: text("entry_type").notNull(),
    actorType: text("actor_type").notNull(),
    amount: integer("amount").notNull(),
    beforeBalance: integer("before_balance").notNull(),
    afterBalance: integer("after_balance").notNull(),
    balanceAfterWalletTotal: integer("balance_after_wallet_total"),
    balanceAfterWalletHeld: integer("balance_after_wallet_held"),
    reason: text("reason"),
    sourceReference: text("source_reference"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "ledger_entry_type_check",
      sql`${table.entryType} IN ('credit', 'hold', 'release', 'deduct', 'compensate_credit', 'compensate_deduct')`,
    ),
    check("ledger_amount_positive", sql`${table.amount} > 0`),
    check(
      "ledger_actor_type_check",
      sql`${table.actorType} IN ('admin', 'tutor', 'student', 'system')`,
    ),
    index("ledger_walletId_idx").on(table.walletId),
    index("ledger_eventKey_idx").on(table.eventKey),
    index("ledger_bookingId_idx").on(table.bookingId),
    index("ledger_createdAt_idx").on(table.createdAt),
    index("ledger_walletId_createdAt_idx").on(table.walletId, table.createdAt),
    uniqueIndex("ledger_idempotency_idx").on(
      table.walletId,
      table.eventKey,
      table.sourceReference,
    ),
  ],
);

export const walletRelations = relations(wallet, ({ one, many }) => ({
  user: one(user, {
    fields: [wallet.userId],
    references: [user.id],
  }),
  entries: many(ledgerEntry),
}));

export const ledgerEntryRelations = relations(ledgerEntry, ({ one }) => ({
  wallet: one(wallet, {
    fields: [ledgerEntry.walletId],
    references: [wallet.id],
  }),
}));

export const userToWalletRelations = relations(user, ({ one }) => ({
  wallet: one(wallet, {
    fields: [user.id],
    references: [wallet.userId],
  }),
}));
