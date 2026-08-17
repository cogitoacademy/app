import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  notification,
  supportTicket,
  user,
  auditLog,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

async function creditWallet(userId: string, amount: number) {
  const { services } = await import("@cogito-app/api/services");
  const w = await services.wallet.getOrCreate(userId);
  await db
    .update(wallet)
    .set({ totalBalance: amount, availableBalance: amount })
    .where(eq(wallet.id, w.id));
}

async function signInAndGetCookie(email: string, password: string) {
  const { auth } = await import("@cogito-app/auth");
  const res = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    asResponse: true,
  });
  const setCookie = res.headers.getSetCookie();
  return setCookie
    .find((c: string) => c.includes("better-auth.session_token"))
    ?.split(";")[0];
}

async function createPublishedTutor(email: string, ts: number) {
  await signUpAndSignIn(email, "Test1234!", "Tutor Support");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Tutor Support",
      token: `token-support-${ts}`,
      status: "accepted",
      invitedBy: tutorId,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedBy: tutorId,
      acceptedAt: new Date(),
    })
    .returning();

  const [profile] = await db
    .insert(tutorProfile)
    .values({
      userId: tutorId,
      inviteId: invite!.id,
      displayName: "Tutor Support",
      shortBio: "Bio",
      credentialsSummary: "Creds",
      expertise: ["Mathematics"],
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .returning();

  const start = new Date(Date.now() + 1 * 3600_000);
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({
      tutorId,
      startDate: start,
      endDate: end,
      modality: "both",
    })
    .returning();

  return { tutorId, profileId: profile!.id, slotId: slot!.id };
}

async function backdateBookingStart(bookingId: string, minutesAgo: number) {
  await db
    .update(booking)
    .set({ scheduledStartAt: new Date(Date.now() - minutesAgo * 60_000) })
    .where(eq(booking.id, bookingId));
}

describe("Support ticket flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.support.${ts}@cogito.test`;
  const adminEmail = `admin.support.${ts}@cogito.test`;
  let studentClient: TestClient;
  let adminClient: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;
  let latenessTicketId: string;
  let technicalTicketId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Support",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }

    const tutorData = await createPublishedTutor(
      `tutor.support.${ts}@cogito.test`,
      ts,
    );
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;

    const start = new Date(Date.now() + 24 * 3600_000).toISOString();
    const end = new Date(Date.now() + 25 * 3600_000).toISOString();
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });
    bookingId = b.id;
    await backdateBookingStart(bookingId, 20);

    await signUpAndSignIn(adminEmail, "Test1234!", "Admin Support");
    const [adminUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, adminEmail));
    await setUserRole(adminUser!.id, "admin");
    adminClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(adminEmail, "Test1234!")) ?? "",
      ),
    );
  });

  test("student reports tutor lateness → ticket created with SLA deadline", async () => {
    const t = await studentClient.support.createTicket({
      category: "tutor_late",
      bookingId,
      description: "Tutor was 20 minutes late",
    });

    latenessTicketId = t.id;
    expect(t.reporterId).toBeDefined();
    expect(t.category).toBe("tutor_late");
    expect(t.status).toBe("open");
    expect(t.slaDeadline).toBeDefined();
    const slaMs = new Date(t.slaDeadline).getTime() - Date.now();
    expect(slaMs).toBeGreaterThanOrEqual(12 * 60 * 60 * 1000 - 60_000);
    expect(slaMs).toBeLessThanOrEqual(12 * 60 * 60 * 1000 + 60_000);
  });

  test("student reports no-show → ticket created", async () => {
    const t = await studentClient.support.createTicket({
      category: "tutor_no_show",
      bookingId,
      description: "Tutor never joined the session",
    });
    expect(t.category).toBe("tutor_no_show");
  });

  test("student reports technical issue without booking → ticket created", async () => {
    const t = await studentClient.support.createTicket({
      category: "technical",
      description: "The app crashed during payment",
    });
    technicalTicketId = t.id;
    expect(t.category).toBe("technical");
    expect(t.bookingId).toBeNull();
  });

  test("lateness report is rejected before start + 15min", async () => {
    const start = new Date(Date.now() + 48 * 3600_000).toISOString();
    const end = new Date(Date.now() + 49 * 3600_000).toISOString();
    const futureBooking = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });

    await expect(
      studentClient.support.createTicket({
        category: "tutor_late",
        bookingId: futureBooking.id,
        description: "Too early",
      }),
    ).rejects.toThrow();
  });

  test("student cannot report lateness on a booking they do not own", async () => {
    const intruder = await signUpAndSignIn(
      `intruder.support.${ts}@cogito.test`,
      "Test1234!",
      "Intruder Support",
    );
    const intruderClient = createTestClient(
      await createTestContext(intruder.cookie),
    );

    await expect(
      intruderClient.support.createTicket({
        category: "tutor_late",
        bookingId,
        description: "Not my booking",
      }),
    ).rejects.toThrow();
  });

  test("student lists only own tickets", async () => {
    const tickets = await studentClient.support.listTickets({});

    expect(tickets.length).toBeGreaterThanOrEqual(3);
    for (const t of tickets) {
      expect(t.reporterId).toBeDefined();
      expect(t.status).toBe("open");
    }
    const ids = tickets.map((t) => t.id);
    expect(ids).toContain(latenessTicketId);
    expect(ids).toContain(technicalTicketId);
  });

  test("admin lists all tickets sorted by SLA urgency", async () => {
    const tickets = await adminClient.support.adminListTickets({});

    expect(tickets.length).toBeGreaterThanOrEqual(3);
    const deadlines = tickets.map((t) => new Date(t.slaDeadline).getTime());
    for (let i = 1; i < deadlines.length; i++) {
      expect(deadlines[i]!).toBeGreaterThanOrEqual(deadlines[i - 1]!);
    }
  });

  test("admin resolves ticket → status resolved + student notified", async () => {
    const resolved = await adminClient.support.adminResolveTicket({
      ticketId: latenessTicketId,
      resolution: "Refunded marks to the student",
    });

    expect(resolved.status).toBe("resolved");
    expect(resolved.resolution).toBe("Refunded marks to the student");

    const [row] = await db
      .select()
      .from(supportTicket)
      .where(eq(supportTicket.id, latenessTicketId));
    expect(row!.assignedTo).toBeDefined();

    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `support.${latenessTicketId}.resolved`));
    expect(notifs.length).toBe(1);
    expect(notifs[0]!.title).toBe("Support ticket resolved");
  });

  test("admin cannot resolve an already resolved ticket", async () => {
    await expect(
      adminClient.support.adminResolveTicket({
        ticketId: latenessTicketId,
        resolution: "Resolved twice",
      }),
    ).rejects.toThrow();
  });

  test("ticket past SLA deadline is auto-escalated by the scheduler consumer", async () => {
    const { services } = await import("@cogito-app/api/services");

    const t = await studentClient.support.createTicket({
      category: "technical",
      description: "SLA escalation test",
    });
    expect(t.status).toBe("open");

    await db
      .update(supportTicket)
      .set({ slaDeadline: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(supportTicket.id, t.id));

    const result = await services.support.escalatePastSlaTickets();
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const [row] = await db
      .select()
      .from(supportTicket)
      .where(eq(supportTicket.id, t.id));
    expect(row!.status).toBe("in_progress");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "support_ticket_escalated"));
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0]!.targetId).toBe(t.id);
    expect(audits[0]!.afterState).toEqual({ status: "in_progress" });
  });

  test("ticket within SLA deadline is NOT escalated", async () => {
    const { services } = await import("@cogito-app/api/services");

    const t = await studentClient.support.createTicket({
      category: "technical",
      description: "Within SLA",
    });

    const before = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "support_ticket_escalated"));

    await services.support.escalatePastSlaTickets();

    const [row] = await db
      .select()
      .from(supportTicket)
      .where(eq(supportTicket.id, t.id));
    expect(row!.status).toBe("open");

    const after = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "support_ticket_escalated"));
    expect(after.length).toBe(before.length);
  });
});
