import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  sessionNote,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor G7");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof G7",
      token: `token-g7-${ts}`,
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
      displayName: "Prof G7",
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

describe("G7: session notes with sanitization", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const tutorEmail = `tutor.g7.${ts}@cogito.test`;
  const studentEmail = `student.g7.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;
  let tutorUserId: string;

  beforeAll(async () => {
    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student G7",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }

    const tutorCookie = await signInAndGetCookie(tutorEmail, "Test1234!");
    const tutorCtx = await createTestContext(tutorCookie);
    tutorUserId = tutorCtx.session?.user.id!;
    tutorClient = createTestClient(tutorCtx);
  });

  test("create and schedule a solo booking", async () => {
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

    const scheduled = await tutorClient.tutorActions.acceptBooking({
      bookingId,
    });
    expect(scheduled.currentState).toBe("scheduled");
  });

  test("cannot add a session note before the session is completed", async () => {
    await expect(
      tutorClient.booking.addSessionNote({
        bookingId,
        content: "Too early",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("tutor completes the session", async () => {
    const updated = await tutorClient.tutorActions.completeSession({
      bookingId,
    });
    expect(updated.currentState).toBe("completed");
  });

  test("tutor adds a note with script injection → stored sanitized", async () => {
    const note = await tutorClient.booking.addSessionNote({
      bookingId,
      content:
        '<script>alert("xss")</script>Student did <strong>great</strong> on <em>integration</em>',
    });
    expect(note.authorId).toBe(tutorUserId);
    expect(note.content).not.toContain("<script>");
    expect(note.content).toContain("<strong>great</strong>");

    const [row] = await db
      .select()
      .from(sessionNote)
      .where(eq(sessionNote.id, note.id));
    expect(row!.content).toBe(
      "Student did <strong>great</strong> on <em>integration</em>",
    );
  });

  test("student can view the tutor's note", async () => {
    const notes = await studentClient.booking.getSessionNotes({ bookingId });
    expect(notes.length).toBe(1);
    expect(notes[0]!.authorId).toBe(tutorUserId);
    expect(notes[0]!.content).toContain("great");
    expect(notes[0]!.content).not.toContain("<script>");
  });

  test("student adds a note and both parties see both notes", async () => {
    const studentNote = await studentClient.booking.addSessionNote({
      bookingId,
      content: "Thanks for the session!",
    });
    expect(studentNote.content).toBe("Thanks for the session!");

    const notes = await tutorClient.booking.getSessionNotes({ bookingId });
    expect(notes.length).toBe(2);
  });
});
