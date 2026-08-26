import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  auditLog,
  booking,
  bookingParticipant,
  notification,
  studentProfile,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  resetDatabase,
  signUpAndSignIn,
  type TestClient,
} from "../helpers/test-client";
import { createTestUser } from "../helpers/factories";

async function createCompletedGroupBooking(params: {
  proposerId: string;
  inviteeId: string;
  tutorId: string;
  type?: "group" | "solo";
  currentState?: string;
}) {
  const start = new Date(Date.now() - 2 * 60 * 60_000);
  const [created] = await db
    .insert(booking)
    .values({
      type: params.type ?? "group",
      modality: "online",
      tutorId: params.tutorId,
      proposerId: params.proposerId,
      targetGroupSize: 2,
      minConfirmedHeadcount: 1,
      confirmedHeadcount: 2,
      currentState: params.currentState ?? "completed",
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 60 * 60_000),
      timezone: "Asia/Jakarta",
      originalMarks: 0,
      holdAmount: 0,
      refundedAmount: 0,
      learningGoal: "Contact sharing test",
    })
    .returning();

  if (!created) throw new Error("Failed to create contact-sharing booking");

  await db.insert(bookingParticipant).values([
    {
      bookingId: created.id,
      userId: params.proposerId,
      role: "proposer",
      confirmationState: "confirmed",
      attendanceState: "present",
      heldAmount: 0,
    },
    {
      bookingId: created.id,
      userId: params.inviteeId,
      role: "invitee",
      confirmationState: "confirmed",
      attendanceState: "present",
      heldAmount: 0,
    },
    {
      bookingId: created.id,
      userId: params.tutorId,
      role: "tutor",
      confirmationState: "confirmed",
      attendanceState: "present",
      heldAmount: 0,
    },
  ]);

  return created.id;
}

describe("consent-based contact sharing", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const timestamp = Date.now();
  const proposerEmail = `contact.proposer.${timestamp}@cogito.test`;
  const inviteeEmail = `contact.invitee.${timestamp}@cogito.test`;
  const outsiderEmail = `contact.outsider.${timestamp}@cogito.test`;
  const tutorEmail = `contact.tutor.${timestamp}@cogito.test`;

  let proposerClient: TestClient;
  let inviteeClient: TestClient;
  let outsiderClient: TestClient;
  let proposerId: string;
  let inviteeId: string;
  let outsiderId: string;
  let tutorId: string;
  let completedBookingId: string;

  beforeAll(async () => {
    const proposer = await signUpAndSignIn(
      proposerEmail,
      "Test1234!",
      "Contact Proposer",
    );
    proposerClient = createTestClient(await createTestContext(proposer.cookie));
    proposerId = (await createTestContext(proposer.cookie)).session!.user.id;

    const invitee = await signUpAndSignIn(
      inviteeEmail,
      "Test1234!",
      "Contact Invitee",
    );
    inviteeClient = createTestClient(await createTestContext(invitee.cookie));
    inviteeId = (await createTestContext(invitee.cookie)).session!.user.id;

    const outsider = await signUpAndSignIn(
      outsiderEmail,
      "Test1234!",
      "Contact Outsider",
    );
    outsiderClient = createTestClient(await createTestContext(outsider.cookie));
    outsiderId = (await createTestContext(outsider.cookie)).session!.user.id;

    const tutor = await createTestUser(tutorEmail, "tutor");
    tutorId = tutor.id;

    completedBookingId = await createCompletedGroupBooking({
      proposerId,
      inviteeId,
      tutorId,
    });
  });

  test("keeps email private in shared-session discovery and pending requests", async () => {
    const bookingView = await proposerClient.booking.get({
      bookingId: completedBookingId,
    });
    expect(JSON.stringify(bookingView)).not.toContain(inviteeEmail);

    const bookingList = await proposerClient.booking.listMine({});
    expect(JSON.stringify(bookingList)).not.toContain(inviteeEmail);

    const listed = await proposerClient.contact.listForBooking({
      bookingId: completedBookingId,
    });
    expect(listed.items).toEqual([
      {
        userId: inviteeId,
        name: "Contact Invitee",
        image: null,
        canRequest: true,
        request: null,
      },
    ]);
    expect(JSON.stringify(listed)).not.toContain(inviteeEmail);

    const requested = await proposerClient.contact.request({
      bookingId: completedBookingId,
      recipientId: inviteeId,
      message: "Seru belajar bareng tadi.",
    });
    expect(requested.request.status).toBe("pending");
    expect(requested.request.email).toBeNull();
    expect(JSON.stringify(requested)).not.toContain(inviteeEmail);

    await expect(
      proposerClient.contact.request({
        bookingId: completedBookingId,
        recipientId: inviteeId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const inviteeView = await inviteeClient.contact.listForBooking({
      bookingId: completedBookingId,
    });
    expect(inviteeView.items[0]?.request).toMatchObject({
      direction: "incoming",
      status: "pending",
      email: null,
    });
    expect(JSON.stringify(inviteeView)).not.toContain(inviteeEmail);

    const notifications = await db
      .select()
      .from(notification)
      .where(eq(notification.bookingId, completedBookingId));
    expect(JSON.stringify(notifications)).not.toContain(inviteeEmail);
  });

  test("lets the recipient accept privately or explicitly share email", async () => {
    const pending = await inviteeClient.contact.listForBooking({
      bookingId: completedBookingId,
    });
    const pendingRequestId = pending.items[0]?.request?.id;
    expect(typeof pendingRequestId).toBe("string");

    await inviteeClient.contact.respond({
      requestId: pendingRequestId!,
      decision: "accept_without_email",
    });

    const privateAcceptance = await proposerClient.contact.listForBooking({
      bookingId: completedBookingId,
    });
    expect(privateAcceptance.items[0]?.request).toMatchObject({
      direction: "outgoing",
      status: "accepted",
      emailShared: false,
      email: null,
    });

    const shareBookingId = await createCompletedGroupBooking({
      proposerId,
      inviteeId,
      tutorId,
    });
    const shareRequest = await proposerClient.contact.request({
      bookingId: shareBookingId,
      recipientId: inviteeId,
    });
    await inviteeClient.contact.respond({
      requestId: shareRequest.request.id,
      decision: "accept_share_email",
    });

    const requesterAfterShare = await proposerClient.contact.listForBooking({
      bookingId: shareBookingId,
    });
    expect(requesterAfterShare.items[0]?.request).toMatchObject({
      direction: "outgoing",
      status: "accepted",
      emailShared: true,
      email: inviteeEmail,
    });

    const recipientAfterShare = await inviteeClient.contact.listForBooking({
      bookingId: shareBookingId,
    });
    expect(recipientAfterShare.items[0]?.request).toMatchObject({
      direction: "incoming",
      status: "accepted",
      emailShared: true,
      email: null,
    });

    const notifications = await db
      .select()
      .from(notification)
      .where(eq(notification.bookingId, shareBookingId));
    expect(JSON.stringify(notifications)).not.toContain(inviteeEmail);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetType, "contact_request"));
    expect(JSON.stringify(audits)).not.toContain(inviteeEmail);

    const declineBookingId = await createCompletedGroupBooking({
      proposerId,
      inviteeId,
      tutorId,
    });
    const declineRequest = await proposerClient.contact.request({
      bookingId: declineBookingId,
      recipientId: inviteeId,
    });
    await expect(
      proposerClient.contact.respond({
        requestId: declineRequest.request.id,
        decision: "decline",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await inviteeClient.contact.respond({
      requestId: declineRequest.request.id,
      decision: "decline",
    });
    await expect(
      inviteeClient.contact.respond({
        requestId: declineRequest.request.id,
        decision: "decline",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      inviteeClient.contact.respond({
        requestId: "missing-contact-request",
        decision: "decline",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("rejects outsiders, incomplete bookings, and recipients who opt out", async () => {
    await expect(
      proposerClient.contact.listForBooking({
        bookingId: "missing-contact-booking",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      outsiderClient.contact.listForBooking({
        bookingId: completedBookingId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      proposerClient.contact.request({
        bookingId: completedBookingId,
        recipientId: outsiderId,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const incompleteBookingId = await createCompletedGroupBooking({
      proposerId,
      inviteeId,
      tutorId,
      currentState: "scheduled",
    });
    await expect(
      proposerClient.contact.listForBooking({
        bookingId: incompleteBookingId,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const soloBookingId = await createCompletedGroupBooking({
      proposerId,
      inviteeId,
      tutorId,
      type: "solo",
    });
    await expect(
      proposerClient.contact.listForBooking({ bookingId: soloBookingId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await db.insert(studentProfile).values({
      userId: inviteeId,
      allowContactRequests: false,
    });
    const optedOutBookingId = await createCompletedGroupBooking({
      proposerId,
      inviteeId,
      tutorId,
    });
    const optedOutList = await proposerClient.contact.listForBooking({
      bookingId: optedOutBookingId,
    });
    expect(optedOutList.items[0]).toMatchObject({
      canRequest: false,
      request: null,
    });
    await expect(
      proposerClient.contact.request({
        bookingId: optedOutBookingId,
        recipientId: inviteeId,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(outsiderId).toBeTruthy();
  });
});
