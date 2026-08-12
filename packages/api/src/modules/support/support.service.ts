import type { DbType } from "../../lib/db";
import {
  ACTOR_TYPE,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  SUPPORT_SLA_MS,
  LATENESS_TOLERANCE_MS,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  ADMIN_DEFAULT_PAGE_LIMIT,
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
    let bookingId = input.bookingId ?? null;

    if (LATENESS_CATEGORIES.has(input.category)) {
      if (!bookingId) throw new SupportBookingAccessError("none");
      const b = await supportRepo.findBookingForReporter(db, bookingId, userId);
      if (!b) throw new SupportBookingAccessError(bookingId);
      const reportableAt = new Date(
        b.scheduledStartAt.getTime() + LATENESS_TOLERANCE_MS,
      );
      if (new Date() < reportableAt) {
        throw new LatenessReportTooEarlyError(bookingId);
      }
    }

    const slaDeadline = new Date(Date.now() + SUPPORT_SLA_MS);
    return supportRepo.insert(db, {
      reporterId: userId,
      bookingId,
      category: input.category,
      description: input.description,
      slaDeadline,
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

  return { createTicket, listTickets, adminList, adminResolveTicket };
}

export type SupportService = ReturnType<typeof createSupportService>;
