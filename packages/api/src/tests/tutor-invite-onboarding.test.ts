import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  user,
  tutorInvite,
  tutorProfile,
  auditLog,
} from "@cogito-app/db/schema";

const SERVER_URL = process.env.VITE_SERVER_URL || "http://localhost:3001";

async function rpc(method: string, input: unknown, cookie: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) headers.Cookie = cookie;
  const init: RequestInit = { method: "POST", headers };
  if (input !== undefined) {
    init.body = JSON.stringify({ json: input });
  }
  const res = await fetch(`${SERVER_URL}/rpc/${method}`, init);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (data && typeof data === "object" && "json" in data) {
    return { status: res.status, data: data.json };
  }
  return { status: res.status, data };
}

async function signUp(email: string, password: string, name: string) {
  const res = await fetch(`${SERVER_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  return res.json() as Promise<{ user?: { id: string } }>;
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${SERVER_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie();
  const sessionCookie = setCookie.find((c: string) =>
    c.includes("better-auth.session_token"),
  );
  return { data: await res.json(), cookie: sessionCookie?.split(";")[0] || "" };
}

async function setUserRole(userId: string, role: string) {
  await db.update(user).set({ role }).where(eq(user.id, userId));
}

async function cleanUser(email: string) {
  const [found] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (found) {
    await db
      .delete(tutorProfile)
      .where(eq(tutorProfile.userId, found.id))
      .catch(() => {});
    await db
      .delete(auditLog)
      .where(eq(auditLog.actorId, found.id))
      .catch(() => {});
    await db.delete(user).where(eq(user.id, found.id));
  }
}

describe("Tutor Invite & Onboarding", () => {
  const ts = Date.now();
  const adminEmail = `admin.${ts}@cogito.test`;
  const tutorEmail = `tutor.${ts}@cogito.test`;
  const otherEmail = `other.${ts}@cogito.test`;
  let adminCookie: string;
  let tutorCookie: string;
  let otherCookie: string;
  let tutorId: string;

  beforeAll(async () => {
    // Create admin user, set role, THEN sign in to get session with admin role
    const adminRes = await signUp(adminEmail, "Test1234!", "Admin Test");
    const adminId = adminRes.user!.id;
    await setUserRole(adminId, "admin");
    const adminSession = await signIn(adminEmail, "Test1234!");
    adminCookie = adminSession.cookie;

    // Create tutor user (role stays "student" until invite claimed)
    const tutorRes = await signUp(tutorEmail, "Test1234!", "Tutor Test");
    tutorId = tutorRes.user!.id;
    const tutorSession = await signIn(tutorEmail, "Test1234!");
    tutorCookie = tutorSession.cookie;

    // Create other student user
    await signUp(otherEmail, "Test1234!", "Other Test");
    const otherSession = await signIn(otherEmail, "Test1234!");
    otherCookie = otherSession.cookie;
  });

  afterAll(async () => {
    await cleanUser(adminEmail);
    await cleanUser(tutorEmail);
    await cleanUser(otherEmail);
  });

  // --- TC-08: Admin creates invite; tutor claims it ---

  describe("TC-08: Invite claim flow", () => {
    let inviteToken: string;

    test("admin creates a tutor invite", async () => {
      const res = await rpc(
        "adminTutor/createInvite",
        {
          email: tutorEmail,
          displayName: "Prof Awesome",
        },
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.email).toBe(tutorEmail);
      expect(res.data.displayName).toBe("Prof Awesome");
      expect(res.data.status).toBe("invited");
      expect(res.data.token).toBeDefined();
      inviteToken = res.data.token;
    });

    test("invite can be verified publicly", async () => {
      const res = await rpc("invite/verify", { token: inviteToken }, "");
      expect(res.status).toBe(200);
      expect(res.data.email).toBe(tutorEmail);
      expect(res.data.displayName).toBe("Prof Awesome");
    });

    test("matching-email user can claim invite", async () => {
      const res = await rpc(
        "invite/claim",
        { token: inviteToken },
        tutorCookie,
      );
      expect(res.status).toBe(200);
      expect(res.data.invite.status).toBe("accepted");
      expect(res.data.profile.onboardingStatus).toBe("draft");

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
    });

    test("claimed invite cannot be verified again", async () => {
      const res = await rpc("invite/verify", { token: inviteToken }, "");
      expect(res.status).toBe(404);
    });

    test("admin can invite same email again after previous invite is accepted", async () => {
      const res = await rpc(
        "adminTutor/createInvite",
        {
          email: tutorEmail,
          displayName: "Prof Awesome Again",
        },
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.email).toBe(tutorEmail);

      await db.delete(tutorInvite).where(eq(tutorInvite.id, res.data.id));
    });
  });

  // --- TC-09: Email mismatch rejection ---

  describe("TC-09: Email mismatch rejection", () => {
    test("wrong-email user cannot claim invite", async () => {
      const createRes = await rpc(
        "adminTutor/createInvite",
        {
          email: `nomatch.${Date.now()}@cogito.test`,
          displayName: "No Match",
        },
        adminCookie,
      );

      const token = createRes.data.token;

      const claimRes = await rpc("invite/claim", { token }, otherCookie);
      expect(claimRes.status).toBe(403);

      await db.delete(tutorInvite).where(eq(tutorInvite.id, createRes.data.id));
    });
  });

  // --- FR-24: Tutor onboarding + review gate ---

  describe("FR-24: Onboarding & review", () => {
    test("tutor can get their profile", async () => {
      const res = await rpc("tutor/getMyProfile", undefined, tutorCookie);
      expect(res.status).toBe(200);
      expect(res.data.onboardingStatus).toBe("draft");
    });

    test("tutor cannot submit for review with missing fields", async () => {
      const res = await rpc("tutor/submitForReview", undefined, tutorCookie);
      expect(res.status).toBe(400);
    });

    test("tutor can update profile with all required fields", async () => {
      const res = await rpc(
        "tutor/updateMyProfile",
        {
          displayName: "Prof Awesome",
          shortBio: "Passionate math educator",
          credentialsSummary: "PhD Mathematics, 10 years teaching",
          expertise: ["Mathematics", "Physics"],
          modality: "online",
          prices: { "1": 50, "2": 40, "3": 32, "4": 28, "5": 25, "6": 22 },
          availabilitySummary: "Weekdays 3-6 PM",
        },
        tutorCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.displayName).toBe("Prof Awesome");
    });

    test("prices below floor are rejected", async () => {
      const res = await rpc(
        "tutor/updateMyProfile",
        {
          modality: "online",
          prices: { "1": 10 },
        },
        tutorCookie,
      );
      expect(res.status).toBe(400);
    });

    test("invalid proof URLs are rejected", async () => {
      const res = await rpc(
        "tutor/updateMyProfile",
        {
          proofUrls: ["not-a-url"],
        },
        tutorCookie,
      );
      expect(res.status).toBe(400);
    });

    test("tutor can submit for review", async () => {
      const res = await rpc("tutor/submitForReview", undefined, tutorCookie);
      expect(res.status).toBe(200);
      expect(res.data.onboardingStatus).toBe("pending_review");
    });

    test("admin requests changes", async () => {
      const [profile] = await db
        .select()
        .from(tutorProfile)
        .where(eq(tutorProfile.userId, tutorId))
        .limit(1);
      expect(profile).toBeDefined();

      const res = await rpc(
        "adminTutor/reviewTutorProfile",
        {
          tutorProfileId: profile!.id,
          action: "request_changes",
          adminNote: "Add more detail",
        },
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.onboardingStatus).toBe("changes_requested");
    });

    test("tutor can re-submit after changes requested", async () => {
      await rpc(
        "tutor/updateMyProfile",
        {
          credentialsSummary: "PhD Math, 10yr exp, Olympiad coach",
        },
        tutorCookie,
      );

      const res = await rpc("tutor/submitForReview", undefined, tutorCookie);
      expect(res.status).toBe(200);
      expect(res.data.onboardingStatus).toBe("pending_review");
    });

    test("admin can publish tutor profile", async () => {
      const [profile] = await db
        .select()
        .from(tutorProfile)
        .where(eq(tutorProfile.userId, tutorId))
        .limit(1);

      const res = await rpc(
        "adminTutor/reviewTutorProfile",
        {
          tutorProfileId: profile!.id,
          action: "publish",
        },
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.onboardingStatus).toBe("published");
      expect(res.data.publishedAt).toBeDefined();
    });

    test("published profile cannot be edited by tutor", async () => {
      const res = await rpc(
        "tutor/updateMyProfile",
        {
          displayName: "Should Not Work",
        },
        tutorCookie,
      );
      expect(res.status).toBe(403);
    });

    test("admin can suspend published tutor", async () => {
      const [profile] = await db
        .select()
        .from(tutorProfile)
        .where(eq(tutorProfile.userId, tutorId))
        .limit(1);

      const res = await rpc(
        "adminTutor/reviewTutorProfile",
        {
          tutorProfileId: profile!.id,
          action: "suspend",
          adminNote: "Policy violation",
        },
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.onboardingStatus).toBe("suspended");
      expect(res.data.publishedAt).toBeNull();
    });

    test("admin can list tutor profiles by status", async () => {
      const res = await rpc(
        "adminTutor/listTutorProfiles",
        {
          status: "suspended",
        },
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // --- Audit log ---

  test("audit log entries exist for key actions", async () => {
    const logs = await db.select().from(auditLog);
    const actions = logs.map((l) => l.action);

    expect(actions).toContain("tutor_invite_created");
    expect(actions).toContain("tutor_invite_claimed");
    expect(actions).toContain("tutor_profile_submitted_for_review");
  });

  // --- Invite lifecycle ---

  describe("Invite lifecycle", () => {
    test("admin can revoke a pending invite", async () => {
      const createRes = await rpc(
        "adminTutor/createInvite",
        {
          email: `revoke.${Date.now()}@cogito.test`,
          displayName: "Revoke Me",
        },
        adminCookie,
      );

      const res = await rpc(
        "adminTutor/revokeInvite",
        {
          inviteId: createRes.data.id,
        },
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.status).toBe("revoked");

      const verifyRes = await rpc(
        "invite/verify",
        { token: createRes.data.token },
        "",
      );
      expect(verifyRes.status).toBe(404);
    });

    test("admin can resend a pending invite", async () => {
      const createRes = await rpc(
        "adminTutor/createInvite",
        {
          email: `resend.${Date.now()}@cogito.test`,
          displayName: "Resend Me",
        },
        adminCookie,
      );

      const oldToken = createRes.data.token;

      const res = await rpc(
        "adminTutor/resendInvite",
        {
          inviteId: createRes.data.id,
        },
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.token).not.toBe(oldToken);
    });

    test("cannot revoke an accepted invite", async () => {
      const [invite] = await db
        .select()
        .from(tutorInvite)
        .where(eq(tutorInvite.email, tutorEmail))
        .limit(1);
      expect(invite).toBeDefined();

      const res = await rpc(
        "adminTutor/revokeInvite",
        {
          inviteId: invite!.id,
        },
        adminCookie,
      );

      expect(res.status).toBe(400);
    });
  });

  // --- Auth gate ---

  test("non-admin cannot access admin endpoints", async () => {
    const res = await rpc("adminTutor/listInvites", undefined, otherCookie);
    expect(res.status).toBe(403);
  });
});
