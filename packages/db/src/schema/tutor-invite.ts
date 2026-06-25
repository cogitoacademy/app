import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";

export const tutorInvite = pgTable(
  "tutor_invite",
  {
    id: uuidPrimaryKey,
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    token: text("token").notNull().unique(),
    status: text("status").notNull().default("invited"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    acceptedBy: text("accepted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedBy: text("revoked_by").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at"),
    internalNotes: text("internal_notes"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "tutor_invite_status_check",
      sql`${table.status} IN ('invited', 'accepted', 'expired', 'revoked')`,
    ),
    index("tutor_invite_email_idx").on(table.email),
    index("tutor_invite_token_idx").on(table.token),
    index("tutor_invite_status_idx").on(table.status),
    index("tutor_invite_invitedBy_idx").on(table.invitedBy),
  ],
);

export const tutorInviteRelations = relations(tutorInvite, ({ one }) => ({
  inviter: one(user, {
    fields: [tutorInvite.invitedBy],
    references: [user.id],
  }),
  acceptor: one(user, {
    fields: [tutorInvite.acceptedBy],
    references: [user.id],
  }),
}));
