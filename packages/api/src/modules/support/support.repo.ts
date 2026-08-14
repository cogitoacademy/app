import { eq, and, lt, asc, desc } from "drizzle-orm";
import {
  supportTicket,
  booking,
  bookingParticipant,
  type supportTicket as supportTicketTable,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

type SupportTicketRow = typeof supportTicketTable.$inferSelect;

export interface InsertSupportTicketParams {
  reporterId: string;
  bookingId?: string | null;
  category: string;
  description: string;
  slaDeadline: Date;
}

export interface ListByReporterInput {
  status?: string;
  limit: number;
}

export interface AdminListInput {
  status?: string;
  limit: number;
  offset: number;
}

async function insert(
  conn: DbOrTx,
  params: InsertSupportTicketParams,
): Promise<SupportTicketRow> {
  const [ticket] = await conn
    .insert(supportTicket)
    .values({
      reporterId: params.reporterId,
      bookingId: params.bookingId ?? null,
      category: params.category,
      description: params.description,
      slaDeadline: params.slaDeadline,
    })
    .returning();
  return ticket!;
}

async function listByReporter(
  conn: DbOrTx,
  userId: string,
  input: ListByReporterInput,
): Promise<SupportTicketRow[]> {
  const conditions = [eq(supportTicket.reporterId, userId)];
  if (input.status) {
    conditions.push(eq(supportTicket.status, input.status));
  }
  return conn
    .select()
    .from(supportTicket)
    .where(and(...conditions))
    .orderBy(desc(supportTicket.createdAt))
    .limit(input.limit);
}

async function adminList(
  conn: DbOrTx,
  input: AdminListInput,
): Promise<SupportTicketRow[]> {
  const conditions = [];
  if (input.status) {
    conditions.push(eq(supportTicket.status, input.status));
  }
  return conn
    .select()
    .from(supportTicket)
    .where(and(...conditions))
    .orderBy(asc(supportTicket.slaDeadline), asc(supportTicket.createdAt))
    .limit(input.limit)
    .offset(input.offset);
}

async function findById(
  conn: DbOrTx,
  id: string,
): Promise<SupportTicketRow | null> {
  const [ticket] = await conn
    .select()
    .from(supportTicket)
    .where(eq(supportTicket.id, id))
    .limit(1);
  return (ticket as SupportTicketRow | undefined) ?? null;
}

async function updateResolution(
  conn: DbOrTx,
  id: string,
  values: { status: string; resolution: string; assignedTo: string },
): Promise<SupportTicketRow | undefined> {
  const [updated] = await conn
    .update(supportTicket)
    .set({
      status: values.status,
      resolution: values.resolution,
      assignedTo: values.assignedTo,
    })
    .where(eq(supportTicket.id, id))
    .returning();
  return updated;
}

async function findBookingForReporter(
  conn: DbOrTx,
  bookingId: string,
  userId: string,
): Promise<typeof booking.$inferSelect | null> {
  const [b] = await conn
    .select()
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  if (!b) return null;
  if (b.proposerId === userId) return b;
  if (b.tutorId === userId) return null;
  const participant = await conn
    .select({ id: bookingParticipant.id })
    .from(bookingParticipant)
    .where(
      and(
        eq(bookingParticipant.bookingId, bookingId),
        eq(bookingParticipant.userId, userId),
      ),
    )
    .limit(1);
  return participant.length > 0 ? b : null;
}

/**
 * Lists open tickets whose SLA deadline has passed (candidates for escalation).
 *
 * @param conn - the database connection or active transaction
 * @returns the overdue open tickets, oldest SLA deadline first
 */
async function listPastSla(conn: DbOrTx): Promise<SupportTicketRow[]> {
  return conn
    .select()
    .from(supportTicket)
    .where(
      and(
        eq(supportTicket.status, "open"),
        lt(supportTicket.slaDeadline, new Date()),
      ),
    )
    .orderBy(asc(supportTicket.slaDeadline));
}

/**
 * Marks a ticket escalated by moving it to in_progress.
 *
 * @param conn - the database connection or active transaction
 * @param id - the support ticket id
 */
async function markEscalated(conn: DbOrTx, id: string): Promise<void> {
  await conn
    .update(supportTicket)
    .set({ status: "in_progress" })
    .where(eq(supportTicket.id, id));
}

export function createSupportRepo() {
  return {
    insert,
    listByReporter,
    adminList,
    findById,
    updateResolution,
    findBookingForReporter,
    listPastSla,
    markEscalated,
  };
}

export type SupportRepo = ReturnType<typeof createSupportRepo>;
