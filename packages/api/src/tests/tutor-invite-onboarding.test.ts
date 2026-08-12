import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  user,
  tutorInvite,
  tutorProfile,
  auditLog,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "./helpers/test-client";

async function expectRejects(promise: Promise<unknown>): Promise<void> {
  let threw = false;
  try {
    await promise;
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
}

describe("Tutor Invite & Onboarding", () => {
  async function getTutorVersion(): Promise<number> {
    const [profile] = await db
      .select()
      .from(tutorProfile)
      .where(eq(tutorProfile.userId, tutorId))
      .limit(1);
    return profile?.version ?? 1;
  }

  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const adminEmail = `admin.${ts}@cogito.test`;
  const tutorEmail = `tutor.${ts}@cogito.test`;
  const otherEmail = `other.${ts}@cogito.test`;
  let adminClient: TestClient;
  let tutorClient: TestClient;
  let otherClient: TestClient;
  let tutorId: string;
  let tutorCookie: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "Admin Test",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    const adminUser = adminCtx.session?.user;
    if (!adminUser) throw new Error("Admin session not found");
    await setUserRole(adminUser.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const tutorRes = await signUpAndSignIn(
      tutorEmail,
      "Test1234!",
      "Tutor Test",
    );
    tutorCookie = tutorRes.cookie;
    const tutorCtx = await createTestContext(tutorRes.cookie);
    if (!tutorCtx.session?.user) throw new Error("Tutor session not found");
    tutorId = tutorCtx.session.user.id;
    tutorClient = createTestClient(await createTestContext(tutorRes.cookie));

    const otherRes = await signUpAndSignIn(
      otherEmail,
      "Test1234!",
      "Other Test",
    );
    otherClient = createTestClient(await createTestContext(otherRes.cookie));
  });

  describe("TC-08: Invite claim flow", () => {
    let inviteToken: string;

    test("admin creates a tutor invite", async () => {
      const invite = await adminClient.adminTutor.createInvite({
        email: tutorEmail,
        displayName: "Prof Awesome",
      });

      expect(invite.email).toBe(tutorEmail);
      expect(invite.displayName).toBe("Prof Awesome");
      expect(invite.status).toBe("invited");
      expect(invite.token).toBeDefined();
      inviteToken = invite.token;
    });

    test("invite can be verified publicly", async () => {
      const publicCtx = await createTestContext();
      const publicClient = createTestClient(publicCtx);
      const result = await publicClient.invite.verify({ token: inviteToken });
      expect(result.email).toBe(tutorEmail);
      expect(result.displayName).toBe("Prof Awesome");
    });

    test("matching-email user can claim invite", async () => {
      const result = await tutorClient.invite.claim({ token: inviteToken });
      expect(result.invite.status).toBe("accepted");
      expect(result.profile.onboardingStatus).toBe("draft");

      const [u] = await db
        .select()
        .from(user)
        .where(eq(user.id, tutorId))
        .limit(1);
      expect(u!.role).toBe("tutor");

      const [p] = await db
        .select()
        .from(tutorProfile)
        .where(eq(tutorProfile.userId, tutorId))
        .limit(1);
      expect(p).toBeDefined();
      expect(p!.displayName).toBe("Prof Awesome");

      tutorClient = createTestClient(await createTestContext(tutorCookie));
    });

    test("claimed invite cannot be verified again", async () => {
      const publicCtx = await createTestContext();
      const publicClient = createTestClient(publicCtx);
      await expectRejects(publicClient.invite.verify({ token: inviteToken }));
    });

    test("admin can invite same email again after previous invite is accepted", async () => {
      const invite = await adminClient.adminTutor.createInvite({
        email: tutorEmail,
        displayName: "Prof Awesome Again",
      });

      expect(invite.email).toBe(tutorEmail);
      await db.delete(tutorInvite).where(eq(tutorInvite.id, invite.id));
    });
  });

  describe.skip("TC-09: Email mismatch rejection", () => {
    test("wrong-email user cannot claim invite", async () => {
      const createRes = await adminClient.adminTutor.createInvite({
        email: `nomatch.${Date.now()}@cogito.test`,
        displayName: "No Match",
      });

      await expectRejects(otherClient.invite.claim({ token: createRes.token }));

      await db.delete(tutorInvite).where(eq(tutorInvite.id, createRes.id));
    });
  });

  describe("FR-24: Onboarding & review", () => {
    test("tutor can get their profile", async () => {
      const profile = await tutorClient.tutor.getMyProfile(undefined as never);
      expect(profile.onboardingStatus).toBe("draft");
    });

    test("tutor cannot submit for review with missing fields", async () => {
      await expectRejects(
        tutorClient.tutor.submitForReview(undefined as never),
      );
    });

    test("tutor can update profile with all required fields", async () => {
      const version = await getTutorVersion();
      const updated = await tutorClient.tutor.updateMyProfile({
        version,
        displayName: "Prof Awesome",
        shortBio: "Passionate math educator",
        credentialsSummary: "PhD Mathematics, 10 years teaching",
        expertise: ["Mathematics", "Physics"],
        modality: "online",
        prices: { "1": 50, "2": 40, "3": 32, "4": 28, "5": 25, "6": 22 },
        availabilitySummary: "Weekdays 3-6 PM",
      });

      expect(updated.displayName).toBe("Prof Awesome");
    });

    test("prices below floor are rejected", async () => {
      const version = await getTutorVersion();
      await expectRejects(
        tutorClient.tutor.updateMyProfile({
          version,
          modality: "online",
          prices: { "1": 10 },
        }),
      );
    });

    test("invalid proof URLs are rejected", async () => {
      const version = await getTutorVersion();
      await expectRejects(
        tutorClient.tutor.updateMyProfile({
          version,
          proofUrls: ["not-a-url"],
        }),
      );
    });

    test("tutor can submit for review", async () => {
      const result = await tutorClient.tutor.submitForReview(
        undefined as never,
      );
      expect(result.onboardingStatus).toBe("pending_review");
    });

    test("admin requests changes", async () => {
      const [profile] = await db
        .select()
        .from(tutorProfile)
        .where(eq(tutorProfile.userId, tutorId))
        .limit(1);
      expect(profile).toBeDefined();

      const result = await adminClient.adminTutor.reviewTutorProfile({
        tutorProfileId: profile!.id,
        action: "request_changes",
        adminNote: "Add more detail",
      });

      expect(result.onboardingStatus).toBe("changes_requested");
    });

    test("tutor can re-submit after changes requested", async () => {
      const version = await getTutorVersion();
      await tutorClient.tutor.updateMyProfile({
        version,
        credentialsSummary: "PhD Math, 10yr exp, Olympiad coach",
      });

      const result = await tutorClient.tutor.submitForReview(
        undefined as never,
      );
      expect(result.onboardingStatus).toBe("pending_review");
    });

    test("admin can publish tutor profile", async () => {
      const [profile] = await db
        .select()
        .from(tutorProfile)
        .where(eq(tutorProfile.userId, tutorId))
        .limit(1);

      const result = await adminClient.adminTutor.reviewTutorProfile({
        tutorProfileId: profile!.id,
        action: "publish",
      });

      expect(result.onboardingStatus).toBe("published");
      expect(result.publishedAt).toBeDefined();
    });

    test("published profile cannot be edited by tutor", async () => {
      const version = await getTutorVersion();
      await expectRejects(
        tutorClient.tutor.updateMyProfile({
          version,
          displayName: "Should Not Work",
        }),
      );
    });

    test("admin can suspend published tutor", async () => {
      const [profile] = await db
        .select()
        .from(tutorProfile)
        .where(eq(tutorProfile.userId, tutorId))
        .limit(1);

      const result = await adminClient.adminTutor.reviewTutorProfile({
        tutorProfileId: profile!.id,
        action: "suspend",
        adminNote: "Policy violation",
      });

      expect(result.onboardingStatus).toBe("suspended");
      expect(result.publishedAt).toBeNull();
    });

    test("admin can list tutor profiles by status", async () => {
      const profiles = await adminClient.adminTutor.listTutorProfiles({
        status: "suspended",
      });
      expect(Array.isArray(profiles)).toBe(true);
    });
  });

  test("audit log entries exist for key actions", async () => {
    const logs = await db.select().from(auditLog);
    const actions = logs.map((l) => l.action);

    expect(actions).toContain("tutor_invite_created");
    expect(actions).toContain("tutor_invite_claimed");
    expect(actions).toContain("tutor_profile_submitted_for_review");
  });

  describe("Invite lifecycle", () => {
    test("admin can revoke a pending invite", async () => {
      const createRes = await adminClient.adminTutor.createInvite({
        email: `revoke.${Date.now()}@cogito.test`,
        displayName: "Revoke Me",
      });

      const result = await adminClient.adminTutor.revokeInvite({
        inviteId: createRes.id,
      });

      expect(result.status).toBe("revoked");

      const publicCtx = await createTestContext();
      const publicClient = createTestClient(publicCtx);
      await expectRejects(
        publicClient.invite.verify({ token: createRes.token }),
      );
    });

    test("admin can resend a pending invite", async () => {
      const createRes = await adminClient.adminTutor.createInvite({
        email: `resend.${Date.now()}@cogito.test`,
        displayName: "Resend Me",
      });

      const oldToken = createRes.token;

      const result = await adminClient.adminTutor.resendInvite({
        inviteId: createRes.id,
      });

      expect(result.token).not.toBe(oldToken);
    });

    test("cannot revoke an accepted invite", async () => {
      const [invite] = await db
        .select()
        .from(tutorInvite)
        .where(eq(tutorInvite.email, tutorEmail))
        .limit(1);
      expect(invite).toBeDefined();

      await expectRejects(
        adminClient.adminTutor.revokeInvite({
          inviteId: invite!.id,
        }),
      );
    });
  });

  test("non-admin cannot access admin endpoints", async () => {
    await expectRejects(otherClient.adminTutor.listInvites(undefined as never));
  });
});
