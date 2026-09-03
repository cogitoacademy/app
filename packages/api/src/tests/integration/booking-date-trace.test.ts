import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { booking, availabilitySlot } from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

const BOOKING_TIMEZONE = "Asia/Jakarta";

// Mirrors the client-side helpers in create-booking-page.tsx exactly.
function formatDateValue(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BOOKING_TIMEZONE,
  }).format(new Date(value));
}

function formatTimeValue(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BOOKING_TIMEZONE,
  }).format(new Date(value));
}

function toSessionStart(slotStartDate: Date | string, time: string) {
  return new Date(`${formatDateValue(slotStartDate)}T${time}:00+07:00`);
}

async function creditWallet(userId: string, amount: number) {
  const { services } = await import("@cogito-app/api/services");
  const w = await services.wallet.getOrCreate(userId);
  await db
    .update(require("@cogito-app/db/schema").wallet)
    .set({ totalBalance: amount, availableBalance: amount })
    .where(eq(require("@cogito-app/db/schema").wallet.id, w.id));
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

async function createPublishedTutor(
  email: string,
  ts: number,
): Promise<{ tutorId: string; slotId: string }> {
  await signUpAndSignIn(email, "Test1234!", "Tutor Trace");
  const cookie = (await signInAndGetCookie(email, "Test1234!")) ?? "";
  const tutorCtx = await createTestContext(cookie);
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const { tutorInvite, tutorProfile } = await import("@cogito-app/db/schema");
  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Tutor Trace",
      token: `token-trace-${ts}`,
      status: "accepted",
      invitedBy: tutorId,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedBy: tutorId,
      acceptedAt: new Date(),
    })
    .returning();

  await db
    .insert(tutorProfile)
    .values({
      userId: tutorId,
      inviteId: invite!.id,
      displayName: "Tutor Trace",
      shortBio: "Bio",
      credentialsSummary: "Creds",
      expertise: ["Mathematics"],
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .execute();

  return { tutorId, slotId: "" };
}

describe("Booking date/time round-trip trace", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.trace.${ts}@cogito.test`;
  const tutorEmail = `tutor.trace.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(studentEmail, "Test1234!", "S");
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }
    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
  });

  test("slot → client construction → API → DB row preserves the WIB wall-clock time", async () => {
    // 1. Create a slot at 2026-09-08 11:00 WIB (= 04:00 UTC) — the exact
    //    construction the availability page uses.
    const slotStart = new Date("2026-09-08T11:00:00+07:00");
    const slotEnd = new Date("2026-09-08T13:00:00+07:00");
    const [slot] = await db
      .insert(availabilitySlot)
      .values({
        tutorId,
        startDate: slotStart,
        endDate: slotEnd,
        modality: "both",
      })
      .returning();
    expect(slot).toBeDefined();

    // 2. Client-side: user picks date 8 / time 11:00 (the slot's own start).
    const pickedTime = formatTimeValue(slot!.startDate);
    const built = toSessionStart(slot!.startDate, pickedTime);
    expect(built.toISOString()).toBe("2026-09-08T04:00:00.000Z");

    // 3. Send over the wire as the client would (Date → ISO string).
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slot!.id,
      modality: "online",
      scheduledStartAt: built.toISOString(),
      timezone: BOOKING_TIMEZONE,
    });

    // 4. Read the DB row — the stored instant must equal the user's wall clock.
    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row).toBeDefined();
    expect(row!.scheduledStartAt.toISOString()).toBe(
      "2026-09-08T04:00:00.000Z",
    );

    // 5. Display side: formatting the stored instant in WIB must show
    //    date 8 / 11:00 — not date 7 / 09:00.
    const displayDate = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: BOOKING_TIMEZONE,
    }).format(row!.scheduledStartAt);
    const displayTime = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: BOOKING_TIMEZONE,
    }).format(row!.scheduledStartAt);
    expect(displayDate).toBe("2026-09-08");
    expect(displayTime).toBe("11:00");
  });

  test("near-midnight slot round-trips without off-by-one-day drift", async () => {
    // Slot at 2026-09-08 00:30 WIB (= 2026-09-07T17:30:00Z).
    const slotStart = new Date("2026-09-08T00:30:00+07:00");
    const slotEnd = new Date("2026-09-08T02:30:00+07:00");
    const [slot] = await db
      .insert(availabilitySlot)
      .values({
        tutorId,
        startDate: slotStart,
        endDate: slotEnd,
        modality: "both",
      })
      .returning();
    expect(slot).toBeDefined();

    const pickedTime = formatTimeValue(slot!.startDate);
    const built = toSessionStart(slot!.startDate, pickedTime);
    expect(built.toISOString()).toBe("2026-09-07T17:30:00.000Z");

    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slot!.id,
      modality: "online",
      scheduledStartAt: built.toISOString(),
      timezone: BOOKING_TIMEZONE,
    });

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.scheduledStartAt.toISOString()).toBe(
      "2026-09-07T17:30:00.000Z",
    );

    const displayDate = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: BOOKING_TIMEZONE,
    }).format(row!.scheduledStartAt);
    const displayTime = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: BOOKING_TIMEZONE,
    }).format(row!.scheduledStartAt);
    expect(displayDate).toBe("2026-09-08");
    expect(displayTime).toBe("00:30");
  });
});
