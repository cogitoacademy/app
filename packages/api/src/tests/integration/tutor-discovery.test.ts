import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  tutorInvite,
  tutorProfile,
  availabilitySlot,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  cleanUser,
  type TestClient,
} from "../helpers/test-client";

describe("Tutor discovery", () => {
  const ts = Date.now();
  const studentEmail = `student.disc.${ts}@cogito.test`;
  const tutorEmail = `tutor.disc.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorId: string;
  let profileId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Disc",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );

    const tutorRes = await signUpAndSignIn(
      tutorEmail,
      "Test1234!",
      "Tutor Disc",
    );
    const tutorCtx = await createTestContext(tutorRes.cookie);
    if (!tutorCtx.session?.user) throw new Error("Tutor session not found");
    tutorId = tutorCtx.session.user.id;
    await setUserRole(tutorId, "tutor");

    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email: tutorEmail,
        displayName: "Prof Discovery",
        token: `token-${ts}`,
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
        displayName: "Prof Discovery",
        shortBio: "Bio",
        credentialsSummary: "Credentials",
        expertise: ["Mathematics"],
        modality: "both",
        prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
        availabilitySummary: "Weekdays evenings",
        onboardingStatus: "published",
        publishedAt: new Date(),
      })
      .returning();
    profileId = profile!.id;

    await db.insert(availabilitySlot).values({
      tutorId,
      startDate: new Date(Date.now() + 3600_000),
      endDate: new Date(Date.now() + 7200_000),
      modality: "online",
    });
  });

  afterAll(async () => {
    await cleanUser(studentEmail);
    await cleanUser(tutorEmail);
  });

  test("TC-07: list published tutors shows required fields", async () => {
    const tutors = await studentClient.tutors.listPublished({});
    expect(tutors.length).toBeGreaterThanOrEqual(1);

    const tutor = tutors.find((t) => t.id === profileId);
    expect(tutor).toBeDefined();
    expect(tutor!.displayName).toBe("Prof Discovery");
    expect(tutor!.expertise).toContain("Mathematics");
    expect(tutor!.modality).toBe("both");
    expect(tutor!.prices).toBeDefined();
    expect(tutor!.availabilitySummary).toBe("Weekdays evenings");
    expect(tutor!.upcomingSlots).toBeDefined();
    expect(tutor!.upcomingSlots.length).toBeGreaterThanOrEqual(1);
  });

  test("getProfile returns published tutor with slots", async () => {
    const profile = await studentClient.tutors.getProfile({
      tutorId: profileId,
    });
    expect(profile.displayName).toBe("Prof Discovery");
    expect(profile.slots).toBeDefined();
    expect(profile.slots.length).toBeGreaterThanOrEqual(1);
    expect(profile.user).toBeDefined();
  });

  test("getProfile returns NOT_FOUND for draft profile", async () => {
    const [draftInvite] = await db
      .insert(tutorInvite)
      .values({
        email: `draft.${ts}@cogito.test`,
        displayName: "Draft",
        token: `draft-token-${ts}`,
        status: "accepted",
        invitedBy: tutorId,
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();

    const [draftProfile] = await db
      .insert(tutorProfile)
      .values({
        userId: tutorId,
        inviteId: draftInvite!.id,
        displayName: "Draft Tutor",
        onboardingStatus: "draft",
      })
      .returning();

    await expect(
      studentClient.tutors.getProfile({ tutorId: draftProfile!.id }),
    ).rejects.toThrow();

    await db.delete(tutorProfile).where(eq(tutorProfile.id, draftProfile!.id));
    await db.delete(tutorInvite).where(eq(tutorInvite.id, draftInvite!.id));
  });
});
