import { describe, test, expect, mock } from "bun:test";
import { createSupportService } from "../../modules/support/support.service";
import {
  SupportTicketNotFoundError,
  SupportBookingAccessError,
  LatenessReportTooEarlyError,
  SupportTicketAlreadyResolvedError,
} from "../../modules/support/support.errors";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      const tx = { ...makeDb(), ...makeRepo() };
      return fn(tx);
    }),
  } as any;
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    insert: mock(async () => ({
      id: "t1",
      reporterId: "student1",
      bookingId: "b1",
      category: "tutor_late",
      description: "Tutor was 20 minutes late",
      status: "open",
      slaDeadline: new Date(Date.now() + 12 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    listByReporter: mock(async () => []),
    adminList: mock(async () => []),
    findById: mock(async () => null),
    updateResolution: mock(async () => ({
      id: "t1",
      reporterId: "student1",
      bookingId: "b1",
      category: "tutor_late",
      description: "Tutor was late",
      status: "resolved",
      slaDeadline: new Date(),
      assignedTo: "admin1",
      resolution: "Refunded marks",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findBookingForReporter: mock(async () => null),
    ...overrides,
  };
}

function makeNotification() {
  return { writeBestEffort: mock(async () => {}) };
}

function makeAudit() {
  return { record: mock(async () => {}) };
}

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    reporterId: "student1",
    bookingId: "b1",
    category: "tutor_late",
    description: "Tutor was 20 minutes late",
    status: "open",
    slaDeadline: new Date(Date.now() + 12 * 60 * 60 * 1000),
    assignedTo: null,
    resolution: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    proposerId: "student1",
    tutorId: "tutor1",
    scheduledStartAt: new Date(Date.now() - 20 * 60 * 1000),
    ...overrides,
  };
}

function createService(overrides: { repo?: Record<string, unknown> } = {}) {
  const db = makeDb();
  const repo = makeRepo(overrides.repo);
  const notification = makeNotification();
  const audit = makeAudit();
  const service = createSupportService({
    supportRepo: repo,
    notification,
    audit,
    db,
  } as any);
  return { service, db, repo, notification, audit };
}

describe("SupportService", () => {
  describe("createTicket", () => {
    test("creates lateness ticket when booking started more than 15 min ago", async () => {
      const booking = makeBooking();
      const { service, repo } = createService({
        repo: { findBookingForReporter: mock(async () => booking) },
      });

      const ticket = await service.createTicket("student1", {
        category: "tutor_late",
        bookingId: "b1",
        description: "Tutor was 20 minutes late",
      });

      expect(ticket).toBeDefined();
      expect(repo.insert).toHaveBeenCalledTimes(1);
      const insertArg = repo.insert.mock.calls[0][1];
      expect(insertArg).toMatchObject({
        reporterId: "student1",
        bookingId: "b1",
        category: "tutor_late",
      });
      const slaMs = insertArg.slaDeadline.getTime() - Date.now();
      expect(slaMs).toBeGreaterThanOrEqual(12 * 60 * 60 * 1000 - 1000);
      expect(slaMs).toBeLessThanOrEqual(12 * 60 * 60 * 1000 + 1000);
    });

    test("throws LatenessReportTooEarlyError when start + 15min is in the future", async () => {
      const booking = makeBooking({
        scheduledStartAt: new Date(Date.now() - 10 * 60 * 1000),
      });
      const { service } = createService({
        repo: { findBookingForReporter: mock(async () => booking) },
      });

      await expect(
        service.createTicket("student1", {
          category: "tutor_no_show",
          bookingId: "b1",
          description: "Tutor never joined",
        }),
      ).rejects.toThrow(LatenessReportTooEarlyError);
    });

    test("throws SupportBookingAccessError when user has no access to booking", async () => {
      const { service } = createService({
        repo: { findBookingForReporter: mock(async () => null) },
      });

      await expect(
        service.createTicket("student1", {
          category: "tutor_late",
          bookingId: "b1",
          description: "Late",
        }),
      ).rejects.toThrow(SupportBookingAccessError);
    });

    test("throws SupportBookingAccessError when lateness category has no bookingId", async () => {
      const { service } = createService();

      await expect(
        service.createTicket("student1", {
          category: "tutor_late",
          description: "Late",
        }),
      ).rejects.toThrow(SupportBookingAccessError);
    });

    test("creates non-lateness ticket without booking access check", async () => {
      const { service, repo } = createService();

      await service.createTicket("student1", {
        category: "technical",
        description: "The app crashed",
      });

      expect(repo.findBookingForReporter).not.toHaveBeenCalled();
      expect(repo.insert).toHaveBeenCalledTimes(1);
      expect(repo.insert.mock.calls[0][1].bookingId).toBeNull();
    });
  });

  describe("listTickets", () => {
    test("lists only own tickets with capped limit", async () => {
      const { service, repo } = createService();

      await service.listTickets("student1", { status: "open", limit: 5 });

      expect(repo.listByReporter).toHaveBeenCalledWith(
        expect.anything(),
        "student1",
        { status: "open", limit: 5 },
      );
    });

    test("caps limit at MAX_PAGE_LIMIT", async () => {
      const { service, repo } = createService();

      await service.listTickets("student1", { limit: 500 });

      expect(repo.listByReporter).toHaveBeenCalledWith(
        expect.anything(),
        "student1",
        { status: undefined, limit: 100 },
      );
    });
  });

  describe("adminList", () => {
    test("passes through status, limit, offset", async () => {
      const { service, repo } = createService();

      await service.adminList({ status: "open", limit: 10, offset: 2 });

      expect(repo.adminList).toHaveBeenCalledWith(expect.anything(), {
        status: "open",
        limit: 10,
        offset: 2,
      });
    });

    test("applies defaults", async () => {
      const { service, repo } = createService();

      await service.adminList();

      expect(repo.adminList).toHaveBeenCalledWith(expect.anything(), {
        status: undefined,
        limit: 50,
        offset: 0,
      });
    });
  });

  describe("adminResolveTicket", () => {
    test("throws SupportTicketNotFoundError when ticket does not exist", async () => {
      const { service } = createService();

      await expect(
        service.adminResolveTicket("admin1", {
          ticketId: "missing",
          resolution: "Refunded",
        }),
      ).rejects.toThrow(SupportTicketNotFoundError);
    });

    test("throws SupportTicketAlreadyResolvedError when already resolved", async () => {
      const { service } = createService({
        repo: {
          findById: mock(async () =>
            makeTicket({ status: "resolved", resolution: "done" }),
          ),
        },
      });

      await expect(
        service.adminResolveTicket("admin1", {
          ticketId: "t1",
          resolution: "Again",
        }),
      ).rejects.toThrow(SupportTicketAlreadyResolvedError);
    });

    test("resolves ticket, notifies reporter, and records audit", async () => {
      const ticket = makeTicket();
      const { service, repo, notification, audit } = createService({
        repo: {
          findById: mock(async () => ticket),
          updateResolution: mock(async () => ({
            ...ticket,
            status: "resolved",
            assignedTo: "admin1",
            resolution: "Refunded marks",
          })),
        },
      });

      const result = await service.adminResolveTicket("admin1", {
        ticketId: "t1",
        resolution: "Refunded marks",
      });

      expect(repo.updateResolution).toHaveBeenCalledTimes(1);
      expect(repo.updateResolution.mock.calls[0][1]).toBe("t1");
      expect(repo.updateResolution.mock.calls[0][2]).toMatchObject({
        status: "resolved",
        resolution: "Refunded marks",
        assignedTo: "admin1",
      });
      expect(result!.status).toBe("resolved");
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort.mock.calls[0][0]).toMatchObject({
        userId: "student1",
        eventKey: "support.t1.resolved",
        title: "Support ticket resolved",
      });
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        actorId: "admin1",
        action: "support_ticket_resolved",
        targetId: "t1",
        targetType: "support_ticket",
      });
    });
  });
});
