import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  ledgerEntry,
  notification,
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

async function createPublishedTutor(email: string, ts: number) {
  await signUpAndSignIn(email, "Test1234!", "Tutor Book");
  const tutorCtx = await createTestContext(
    (await signInAndGetCookie(email, "Test1234!")) ?? "",
  );
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Booking",
      token: `token-book-${ts}`,
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
      displayName: "Prof Booking",
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

  const start = new Date(Date.now() + 24 * 3600_000);
  const end = new Date(Date.now() + 25 * 3600_000);
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

describe("Booking solo flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.book.${ts}@cogito.test`;
  const tutorEmail = `tutor.book.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Book",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }

    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;

    const tutorCookie = await signInAndGetCookie(tutorEmail, "Test1234!");
    tutorClient = createTestClient(await createTestContext(tutorCookie));
  });

  test("TC-11: student creates solo booking → awaiting_tutor_review", async () => {
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
    expect(b.currentState).toBe("awaiting_tutor_review");
    expect(b.type).toBe("solo");
    expect(b.holdAmount).toBeGreaterThan(0);
  });

  test("Marks held on wallet", async () => {
    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBeGreaterThan(0);
  });

  test("ledger has hold entry", async () => {
    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, bookingId));
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]!.entryType).toBe("hold");
  });

  test("tutor notification written", async () => {
    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `booking.${bookingId}.tutor_request`));
    expect(notifs.length).toBe(1);
  });

  test("TC-13: tutor accepts → scheduled (online)", async () => {
    const updated = await tutorClient.tutorActions.acceptBooking({
      bookingId,
    });
    expect(updated.currentState).toBe("scheduled");
  });

  test("meeting event created", async () => {
    const b = await studentClient.booking.get({ bookingId });
    expect(b.meeting).toBeDefined();
    expect(b.meeting?.status).toBe("manual");
  });

  test("TC-16: tutor completes session → completed", async () => {
    const updated = await tutorClient.tutorActions.completeSession({
      bookingId,
    });
    expect(updated.currentState).toBe("completed");
  });

  test("Marks deducted from wallet", async () => {
    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBe(0);
  });
});

describe("Booking decline flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now() + 1000;
  const studentEmail = `student.decl.${ts}@cogito.test`;
  const tutorEmail = `tutor.decl.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Decl",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }

    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;

    const tutorCookie = await signInAndGetCookie(tutorEmail, "Test1234!");
    tutorClient = createTestClient(await createTestContext(tutorCookie));
  });

  test("TC-14: tutor declines → declined + Marks released", async () => {
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

    const updated = await tutorClient.tutorActions.declineBooking({
      bookingId,
      reason: "Schedule conflict",
    });
    expect(updated.currentState).toBe("declined");

    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBe(0);
  });
});

describe("Booking cancel flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now() + 2000;
  const studentEmail = `student.cancel.${ts}@cogito.test`;
  const tutorEmail = `tutor.cancel.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Cancel",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }

    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;
  });

  test("TC-15: student cancels before H-2 → cancelled + Marks released", async () => {
    const start = new Date(Date.now() + 48 * 3600_000).toISOString();
    const end = new Date(Date.now() + 49 * 3600_000).toISOString();

    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });
    bookingId = b.id;

    const updated = await studentClient.booking.cancel({
      bookingId,
      cancellationReason: "Changed mind",
    });
    expect(updated.currentState).toBe("cancelled");

    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBe(0);
  });
});
