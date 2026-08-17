import type { DbType } from "../../lib/db";
import {
  ACTOR_TYPE,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  LATENESS_TOLERANCE_MS,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  ADMIN_DEFAULT_PAGE_LIMIT,
  WIB_UTC_OFFSET_HOURS,
  SUPPORT_SLA_BUSINESS_MINUTES,
  SUPPORT_SLA_OFF_HOURS_HOURS,
  SUPPORT_BUSINESS_START_HOUR_WIB,
  SUPPORT_BUSINESS_END_HOUR_WIB,
  SUPPORT_BUSINESS_DAYS,
} from "../../shared/constants";
import type { SupportRepo } from "./support.repo";
import type { SupportNotificationPort, SupportAuditPort } from "./index";
import {
  SupportTicketNotFoundError,
  SupportBookingAccessError,
  LatenessReportTooEarlyError,
  SupportTicketAlreadyResolvedError,
} from "./support.errors";

export const LATENESS_CATEGORIES = new Set(["tutor_late", "tutor_no_show"]);
export const RESOLVED_STATUSES = new Set(["resolved", "closed"]);

/**
 * Whether the given instant falls inside business hours: Mon–Sat 09:00–21:00
 * WIB (UTC+7). The instant is converted to WIB wall-clock time, so DST-free
 * UTC+7 is a fixed offset.
 */
export function isBusinessTimeWib(at: Date): boolean {
  const wibMs = at.getTime() + WIB_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  if (
    !SUPPORT_BUSINESS_DAYS.includes(
      wib.getUTCDay() as (typeof SUPPORT_BUSINESS_DAYS)[number],
    )
  ) {
    return false;
  }
  const hour = wib.getUTCHours();
  return (
    hour >= SUPPORT_BUSINESS_START_HOUR_WIB &&
    hour < SUPPORT_BUSINESS_END_HOUR_WIB
  );
}

/**
 * Computes the OQ-04 SLA deadline for a ticket created at `now`:
 * 30 minutes during business hours (Mon–Sat 09:00–21:00 WIB), 4 hours outside.
 * Wall-clock rule — the deadline is `now + SLA window` regardless of where the
 * window lands.
 */
export function computeSlaDeadline(now: Date): Date {
  if (isBusinessTimeWib(now)) {
    return new Date(now.getTime() + SUPPORT_SLA_BUSINESS_MINUTES * 60_000);
  }
  return new Date(now.getTime() + SUPPORT_SLA_OFF_HOURS_HOURS * 60 * 60_000);
}

export interface CreateTicketInput {
  category: "tutor_late" | "tutor_no_show" | "technical" | "payment" | "other";
  bookingId?: string;
  description: string;
}

export interface ListTicketsInput {
  status?: string;
  limit?: number;
}

export interface AdminListInput {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface AdminResolveInput {
  ticketId: string;
  resolution: string;
}

export function createSupportService(deps: {
  supportRepo: SupportRepo;
  notification: SupportNotificationPort;
  audit: SupportAuditPort;
  db: DbType;
}) {
  const { supportRepo, notification, audit, db } = deps;

  async function createTicket(userId: string, input: CreateTicketInput) {
    const bookingId = input.bookingId ?? null;

    let booking: Awaited<
      ReturnType<typeof supportRepo.findBookingForReporter>
    > = null;
    if (bookingId) {
      // A ticket may only reference a booking the reporter is part of (L2).
      booking = await supportRepo.findBookingForReporter(db, bookingId, userId);
      if (!booking) throw new SupportBookingAccessError(bookingId);
    }

    if (LATENESS_CATEGORIES.has(input.category)) {
      if (!booking || !bookingId) throw new SupportBookingAccessError("none");
      const reportableAt = new Date(
        booking.scheduledStartAt.getTime() + LATENESS_TOLERANCE_MS,
      );
      if (new Date() < reportableAt) {
        throw new LatenessReportTooEarlyError(bookingId);
      }
    }

    const slaDeadline = computeSlaDeadline(new Date());
    return db.transaction(async (tx) => {
      const ticket = await supportRepo.insert(tx, {
        reporterId: userId,
        bookingId,
        category: input.category,
        description: input.description,
        slaDeadline,
      });

      // OQ-04: auto-acknowledge on request so the reporter immediately knows
      // their ticket is being handled and when the SLA deadline is.
      await notification.writeBestEffort({
        db: tx,
        userId,
        bookingId: bookingId ?? undefined,
        category: NOTIFICATION_CATEGORY.SYSTEM,
        severity: NOTIFICATION_SEVERITY.INFO,
        title: "Support ticket received",
        body: `Your support ticket (#${ticket.id.slice(0, 8)}) has been received. We respond within ${slaDeadline
          .toISOString()
          .slice(0, 16)}.`,
        eventKey: `support.${ticket.id}.acknowledged`,
        metadata: {
          ticketId: ticket.id,
          slaDeadline: slaDeadline.toISOString(),
        },
      });

      return ticket;
    });
  }

  async function listTickets(userId: string, input: ListTicketsInput = {}) {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    return supportRepo.listByReporter(db, userId, {
      status: input.status,
      limit,
    });
  }

  async function adminList(input: AdminListInput = {}) {
    const limit = Math.min(
      input.limit ?? ADMIN_DEFAULT_PAGE_LIMIT,
      MAX_PAGE_LIMIT,
    );
    return supportRepo.adminList(db, {
      status: input.status,
      limit,
      offset: input.offset ?? 0,
    });
  }

  /**
   * Auto-escalates open support tickets whose SLA deadline has passed.
   *
   * Called by the `escalate-support-tickets` scheduler job. Each overdue ticket
   * is moved to `in_progress`, an audit entry records the escalation, and an
   * `escalated` notification row is emitted as the hook point a future
   * WhatsApp adapter consumes (see MODULE-REFERENCE Support Business Rules).
   *
   * @returns the number of tickets escalated
   */
  async function escalatePastSlaTickets(): Promise<{ escalated: number }> {
    const overdue = await supportRepo.listPastSla(db);
    let escalated = 0;

    for (const ticket of overdue) {
      await db.transaction(async (tx) => {
        await supportRepo.markEscalated(tx, ticket.id);
        await audit.record({
          db: tx,
          actorId: null,
          actorType: ACTOR_TYPE.SYSTEM,
          action: "support_ticket_escalated",
          targetId: ticket.id,
          targetType: "support_ticket",
          beforeState: { status: ticket.status },
          afterState: { status: "in_progress" },
          details: { slaDeadline: ticket.slaDeadline.toISOString() },
        });
        // OQ-04: escalation hook — a future WhatsApp adapter consumes
        // notifications with this event key (metadata carries the target).
        await notification.writeBestEffort({
          db: tx,
          userId: ticket.reporterId,
          bookingId: ticket.bookingId ?? undefined,
          category: NOTIFICATION_CATEGORY.SYSTEM,
          severity: NOTIFICATION_SEVERITY.INFO,
          title: "Support ticket escalated",
          body: `Your support ticket (#${ticket.id.slice(0, 8)}) has been escalated.`,
          eventKey: `support.${ticket.id}.escalated`,
          metadata: {
            ticketId: ticket.id,
            slaDeadline: ticket.slaDeadline.toISOString(),
            whatsappTarget: "+6288101190195",
            escalate: true,
          },
        });
      });
      escalated++;
    }

    return { escalated };
  }

  async function adminResolveTicket(adminId: string, input: AdminResolveInput) {
    const existing = await supportRepo.findById(db, input.ticketId);
    if (!existing) throw new SupportTicketNotFoundError(input.ticketId);
    if (RESOLVED_STATUSES.has(existing.status)) {
      throw new SupportTicketAlreadyResolvedError(input.ticketId);
    }

    return db.transaction(async (tx) => {
      const updated = await supportRepo.updateResolution(tx, input.ticketId, {
        status: "resolved",
        resolution: input.resolution,
        assignedTo: adminId,
      });

      await notification.writeBestEffort({
        db: tx,
        userId: existing.reporterId,
        category: NOTIFICATION_CATEGORY.SYSTEM,
        severity: NOTIFICATION_SEVERITY.INFO,
        title: "Support ticket resolved",
        body: `Your support ticket (#${existing.id.slice(0, 8)}) has been resolved.`,
        eventKey: `support.${input.ticketId}.resolved`,
        metadata: { resolution: input.resolution },
      });

      await audit.record({
        db: tx,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        action: "support_ticket_resolved",
        targetId: input.ticketId,
        targetType: "support_ticket",
        details: {
          previousStatus: existing.status,
          resolution: input.resolution,
        },
      });

      return updated;
    });
  }

  return {
    createTicket,
    listTickets,
    adminList,
    adminResolveTicket,
    escalatePastSlaTickets,
  };
}

export type SupportService = ReturnType<typeof createSupportService>;
