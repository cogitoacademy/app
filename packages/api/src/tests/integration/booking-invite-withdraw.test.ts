import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  availabilitySlot,
  bookingParticipant,
  notification,
  tutorInvite,
  tutorProfile,
  wallet,
} from "@cogito-app/db/schema";

import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
  type TestClient,
} from "../helpers/test-client";

async function creditWallet(userId: string, amount: number) {
  const { services } = await import("@cogito-app/api/services");
  const current = await services.wallet.getOrCreate(userId);
  await db
    .update(wallet)
    .set({ totalBalance: amount, availableBalance: amount })
    .where(eq(wallet.id, current.id));
}

async function signInAndGetCookie(email: string, password: string) {
  const { auth } = await import("@cogito-app/auth");
  const response = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    asResponse: true,
  });
  return response.headers
    .getSetCookie()
    .find((cookie: string) => cookie.includes("better-auth.session_token"))
    ?.split(";")[0];
}

describe("Booking invite withdrawal", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const tutorEmail = `tutor.withdraw.${ts}@cogito.test`;
  const proposerEmail = `proposer.withdraw.${ts}@cogito.test`;
  const inviteeEmail = `invitee.withdraw.${ts}@cogito.test`;
  const otherInviteeEmail = `invitee2.withdraw.${ts}@cogito.test`;
  let proposerClient: TestClient;
  let inviteeId: string;
  let tutorId: string;
  let slotId: string;

  beforeAll(async () => {
    await signUpAndSignIn(tutorEmail, "Test1234!", "Tutor Withdraw");
    const tutorCookie = await signInAndGetCookie(tutorEmail, "Test1234!");
    const tutorContext = await createTestContext(tutorCookie ?? "");
    tutorId = tutorContext.session?.user.id!;
    await setUserRole(tutorId, "tutor");

    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email: tutorEmail,
        displayName: "Tutor Withdraw",
        token: `token-withdraw-${ts}`,
        status: "accepted",
        invitedBy: tutorId,
        expiresAt: new Date(Date.now() + 86_400_000),
        acceptedBy: tutorId,
        acceptedAt: new Date(),
      })
      .returning();
    await db.insert(tutorProfile).values({
      userId: tutorId,
      inviteId: invite!.id,
      displayName: "Tutor Withdraw",
      shortBio: "Group invite test tutor",
      credentialsSummary: "Credentials",
      expertise: ["Mathematics"],
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    });
    const [slot] = await db
      .insert(availabilitySlot)
      .values({
        tutorId,
        startDate: new Date(Date.now() + 3_600_000),
        endDate: new Date(Date.now() + 7 * 86_400_000),
        modality: "both",
      })
      .returning();
    slotId = slot!.id;

    const proposer = await signUpAndSignIn(
      proposerEmail,
      "Test1234!",
      "Proposer Withdraw",
    );
    const proposerContext = await createTestContext(proposer.cookie);
    proposerClient = createTestClient(proposerContext);
    await creditWallet(proposerContext.session?.user.id!, 300);

    const invitee = await signUpAndSignIn(
      inviteeEmail,
      "Test1234!",
      "Invitee Withdraw",
    );
    const inviteeContext = await createTestContext(invitee.cookie);
    inviteeId = inviteeContext.session?.user.id!;
    await creditWallet(inviteeId, 100);

    const otherInvitee = await signUpAndSignIn(
      otherInviteeEmail,
      "Test1234!",
      "Other Invitee",
    );
    const otherContext = await createTestContext(otherInvitee.cookie);
    await creditWallet(otherContext.session?.user.id!, 100);
  });

  test("proposer can withdraw one pending invite without changing headcount", async () => {
    const booking = await proposerClient.booking.createGroup({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      targetGroupSize: 3,
      inviteeUserIds: [inviteeId],
      scheduledStartAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      scheduledEndAt: new Date(Date.now() + 49 * 3_600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });

    const result = await proposerClient.booking.withdrawInvite({
      bookingId: booking.id,
      inviteeUserId: inviteeId,
      reason: "The group size changed",
    });

    expect(result).toEqual({ withdrawn: true, inviteeUserId: inviteeId });
    expect(booking.confirmedHeadcount).toBe(1);
    expect(booking.currentState).toBe("awaiting_participant_confirmation");

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, booking.id),
          eq(bookingParticipant.userId, inviteeId),
        ),
      );
    expect(participant!.confirmationState).toBe("withdrawn_pre_h2");
    expect(participant!.heldAmount).toBe(0);
    expect(participant!.withdrawnReason).toBe("The group size changed");

    const [inviteNotification] = await db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.userId, inviteeId),
          eq(
            notification.eventKey,
            `booking.${booking.id}.invite_withdrawn.${inviteeId}`,
          ),
        ),
      );
    expect(inviteNotification!.title).toBe("Group invitation withdrawn");
    expect(inviteNotification!.body).toContain("group size changed");
  });
});
