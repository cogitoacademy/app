import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const wallet = pgTable(
  "wallet",
  {
    id: text("id").primaryKey(),
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
  (table) => [index("wallet_userId_idx").on(table.userId)],
);

export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: text("id").primaryKey(),
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
    reason: text("reason"),
    sourceReference: text("source_reference"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ledger_walletId_idx").on(table.walletId),
    index("ledger_eventKey_idx").on(table.eventKey),
    index("ledger_bookingId_idx").on(table.bookingId),
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
