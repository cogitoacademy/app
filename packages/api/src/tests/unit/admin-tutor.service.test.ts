import { describe, test, expect, mock } from "bun:test";
import {
  validateReviewAction,
  buildReviewUpdates,
  buildTutorInviteEmail,
  createAdminTutorService,
  type ReviewAction,
  type TutorProfileSnapshot,
} from "../../modules/admin-tutor/admin-tutor.service";
import {
  TutorProfileNotFoundError,
  InvalidInviteActionError,
  DuplicateInviteError,
  InviteNotFoundError,
} from "../../modules/admin-tutor/admin-tutor.errors";

function makeProfile(
  overrides: Partial<TutorProfileSnapshot> = {},
): TutorProfileSnapshot {
  return {
    id: "p1",
    onboardingStatus: "pending_review",
    publishedAt: null,
    ...overrides,
  };
}

function makeInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    email: "tutor@example.com",
    displayName: "Tutor",
    token: "tok1",
    status: "invited",
    invitedBy: "admin1",
    internalNotes: null,
    expiresAt: new Date(),
    ...overrides,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const invite = makeInvite();
  const profile = makeProfile();
  return {
    adminTutorRepo: {
      findActiveInviteByEmail: mock(async () => null),
      findUserAccountsByEmail: mock(async () => undefined),
      insertInvite: mock(async () => invite),
      getInviteById: mock(async () => invite),
      updateInvite: mock(async () => invite),
      listInvites: mock(async () => [invite]),
      getTutorProfileById: mock(async () => profile),
      updateTutorProfile: mock(async () => profile),
      listTutorProfiles: mock(async () => [profile]),
    },
    auditPort: { record: mock(async () => {}) },
    emailPort: { send: mock(async () => ({ messageId: "email1" })) },
    appBaseUrl: "https://app.cogito.test",
    db: {
      transaction: mock(async (fn: any) => {
        const tx = {};
        return fn(tx);
      }),
    },
    ...overrides,
  };
}

describe("AdminTutor Service", () => {
  describe("buildTutorInviteEmail", () => {
    test("creates a clear, branded invitation with one primary action", () => {
      const message = buildTutorInviteEmail(
        makeInvite({ expiresAt: new Date("2026-08-23T12:00:00.000Z") }),
        "https://app.cogito.test/",
      );

      expect(message.subject).toBe("You’re invited to teach with Cogito");
      expect(message.html).toContain("You’re invited to tutor with Cogito");
      expect(message.html).toContain("background:#e09e06");
      expect(message.html).toContain("Accept invitation &amp; set up profile");
      expect(message.html).toContain("23 August 2026 at 12:00 UTC");
      expect(message.html).toContain(
        "https://app.cogito.test/invite?token=tok1",
      );
      expect(message.html).toContain("tutor@example.com");
    });

    test("escapes invitee-controlled copy and encodes the token", () => {
      const message = buildTutorInviteEmail(
        makeInvite({
          displayName: '<script>alert("x")</script>',
          email: "unsafe&email@example.com",
          token: "token with spaces&symbols",
        }),
        "https://app.cogito.test",
      );

      expect(message.html).not.toContain("<script>");
      expect(message.html).toContain("&lt;script&gt;");
      expect(message.html).toContain("unsafe&amp;email@example.com");
      expect(message.html).toContain("token%20with%20spaces%26symbols");
    });
  });

  describe("validateReviewAction", () => {
    test("returns profile for valid action with profile", () => {
      const result = validateReviewAction(
        "publish",
        makeProfile({ onboardingStatus: "approved_unpublished" }),
      );
      expect(result.profile.onboardingStatus).toBe("approved_unpublished");
    });

    test("throws TutorProfileNotFoundError for null profile", () => {
      expect(() => validateReviewAction("publish", null)).toThrow(
        TutorProfileNotFoundError,
      );
    });

    const actions: ReviewAction[] = [
      "request_changes",
      "approve_unpublished",
      "publish",
      "unpublish",
      "suspend",
    ];
    for (const action of actions) {
      test(`returns profile for action: ${action}`, () => {
        const result = validateReviewAction(action, makeProfile());
        expect(result.profile.onboardingStatus).toBe("pending_review");
      });
    }

    test("throws InvalidInviteActionError for invalid action string", () => {
      expect(() =>
        validateReviewAction("invalid_action" as ReviewAction, makeProfile()),
      ).toThrow(InvalidInviteActionError);
    });
  });

  describe("buildReviewUpdates", () => {
    test("publish sets publishedAt and status", () => {
      const { updates, newStatus } = buildReviewUpdates("publish");
      expect(newStatus).toBe("published");
      expect(updates.onboardingStatus).toBe("published");
      expect(updates.publishedAt).toBeInstanceOf(Date);
    });

    test("unpublish clears publishedAt", () => {
      const { updates, newStatus } = buildReviewUpdates("unpublish");
      expect(newStatus).toBe("approved_unpublished");
      expect(updates.publishedAt).toBeNull();
    });

    test("suspend clears publishedAt", () => {
      const { updates } = buildReviewUpdates("suspend");
      expect(updates.onboardingStatus).toBe("suspended");
      expect(updates.publishedAt).toBeNull();
    });

    test("request_changes sets adminNote null by default", () => {
      const { updates } = buildReviewUpdates("request_changes");
      expect(updates.onboardingStatus).toBe("changes_requested");
      expect(updates.adminReviewNote).toBeNull();
    });

    test("approve_unpublished sets adminNote from param", () => {
      const { updates } = buildReviewUpdates(
        "approve_unpublished",
        "looks good",
      );
      expect(updates.adminReviewNote).toBe("looks good");
    });

    test("buildReviewUpdates throws InvalidInviteActionError for invalid action", () => {
      expect(() =>
        buildReviewUpdates("invalid_action" as ReviewAction),
      ).toThrow(InvalidInviteActionError);
    });
  });

  describe("createAdminTutorService", () => {
    test("inspectInvitee reports Google and credential providers", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          findUserAccountsByEmail: mock(async () => ({
            id: "u1",
            email: "tutor@example.com",
            name: "Tutor",
            role: "student",
            accounts: [{ providerId: "google" }, { providerId: "credential" }],
          })),
        },
      });
      const service = createAdminTutorService(deps as any);
      const result = await service.inspectInvitee({
        email: "tutor@example.com",
      });
      expect(result.exists).toBe(true);
      expect(result.hasGoogle).toBe(true);
      expect(result.hasPassword).toBe(true);
    });

    test("inspectInvitee reports a not-found email", async () => {
      const service = createAdminTutorService(makeDeps() as any);
      await expect(
        service.inspectInvitee({ email: "missing@example.com" }),
      ).resolves.toEqual({
        exists: false,
        email: "missing@example.com",
        name: null,
        role: null,
        providers: [],
        hasGoogle: false,
        hasPassword: false,
      });
    });

    test("reports a failed invite email delivery", async () => {
      const deps = makeDeps({
        emailPort: {
          send: mock(async () => {
            throw new Error("mail provider down");
          }),
        },
      });
      const service = createAdminTutorService(deps as any);

      await expect(
        service.sendInviteAgain("admin1", "inv1"),
      ).resolves.toMatchObject({ id: "inv1", emailDelivery: "failed" });
    });

    test("createInvite throws DuplicateInviteError when active invite exists", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          findActiveInviteByEmail: mock(async () => makeInvite()),
        },
      });
      const service = createAdminTutorService(deps as any);
      await expect(
        service.createInvite("admin1", {
          email: "tutor@example.com",
          displayName: "Tutor",
        }),
      ).rejects.toThrow(DuplicateInviteError);
    });

    test("createInvite succeeds when no active invite exists", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.createInvite("admin1", {
        email: "new@example.com",
        displayName: "New Tutor",
      });
      expect(result.id).toBe("inv1");
    });

    test("createInvite throws DuplicateInviteError on unique violation", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          insertInvite: mock(async () => {
            const err = new Error("unique violation");
            (err as any).code = "23505";
            throw err;
          }),
        },
      });
      const service = createAdminTutorService(deps as any);
      await expect(
        service.createInvite("admin1", {
          email: "tutor@example.com",
          displayName: "Tutor",
        }),
      ).rejects.toThrow(DuplicateInviteError);
    });

    test("createInvite re-throws non-unique errors", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          insertInvite: mock(async () => {
            throw new Error("other db error");
          }),
        },
      });
      const service = createAdminTutorService(deps as any);
      await expect(
        service.createInvite("admin1", {
          email: "tutor@example.com",
          displayName: "Tutor",
        }),
      ).rejects.toThrow("other db error");
    });

    test("createInvite with internalNotes passes them through", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.createInvite("admin1", {
        email: "new@example.com",
        displayName: "New Tutor",
        internalNotes: "some notes",
      });
      expect(result.id).toBe("inv1");
      expect(deps.adminTutorRepo.insertInvite).toHaveBeenCalled();
    });

    test("createInvite stores a digest and returns the plaintext once (M10)", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.createInvite("admin1", {
        email: "hash@example.com",
        displayName: "Hash Tutor",
      });
      const inserted = (deps.adminTutorRepo.insertInvite as any).mock
        .calls[0][1];
      expect(inserted.token).toMatch(/^[0-9a-f]{64}$/);
      expect(inserted.token).not.toBe(result.token);
    });

    test("listInvites defaults limit and offset", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.listInvites();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "inv1",
        email: "tutor@example.com",
        displayName: "Tutor",
        status: "invited",
        invitedBy: "admin1",
        internalNotes: null,
      });
      // Stored digests are never surfaced in list responses (M10).
      expect(result[0].token).toBeUndefined();
    });

    test("listInvites passes status filter", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.listInvites({ status: "invited" });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "inv1",
        email: "tutor@example.com",
        displayName: "Tutor",
        status: "invited",
        invitedBy: "admin1",
        internalNotes: null,
      });
      expect(result[0].token).toBeUndefined();
    });

    test("resendInvite throws InviteNotFoundError for missing invite", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          getInviteById: mock(async () => null),
        },
      });
      const service = createAdminTutorService(deps as any);
      await expect(
        service.resendInvite("admin1", "nonexistent"),
      ).rejects.toThrow(InviteNotFoundError);
    });

    test("resendInvite throws InvalidInviteActionError for non-invited status", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          getInviteById: mock(async () => makeInvite({ status: "accepted" })),
        },
      });
      const service = createAdminTutorService(deps as any);
      await expect(service.resendInvite("admin1", "inv1")).rejects.toThrow(
        InvalidInviteActionError,
      );
    });

    test("resendInvite succeeds for invited status", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.resendInvite("admin1", "inv1");
      expect(result.id).toBe("inv1");
      expect(deps.emailPort.send).not.toHaveBeenCalled();
    });

    test("sendInviteAgain rotates and explicitly sends email", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.sendInviteAgain("admin1", "inv1");
      expect(result.id).toBe("inv1");
      expect(result.emailDelivery).toBe("sent");
      expect(deps.emailPort.send).toHaveBeenCalledTimes(1);
    });

    test("revokeInvite throws InviteNotFoundError for missing invite", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          getInviteById: mock(async () => null),
        },
      });
      const service = createAdminTutorService(deps as any);
      await expect(
        service.revokeInvite("admin1", "nonexistent"),
      ).rejects.toThrow(InviteNotFoundError);
    });

    test("revokeInvite throws InvalidInviteActionError for non-invited status", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          getInviteById: mock(async () => makeInvite({ status: "accepted" })),
        },
      });
      const service = createAdminTutorService(deps as any);
      await expect(service.revokeInvite("admin1", "inv1")).rejects.toThrow(
        InvalidInviteActionError,
      );
    });

    test("revokeInvite succeeds for invited status", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.revokeInvite("admin1", "inv1");
      expect(result.id).toBe("inv1");
    });

    test("listTutorProfiles defaults limit and offset", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.listTutorProfiles();
      expect(result).toEqual([makeProfile()]);
    });

    test("listTutorProfiles passes status filter", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.listTutorProfiles({ status: "published" });
      expect(result).toEqual([makeProfile()]);
    });

    test("reviewTutorProfile throws TutorProfileNotFoundError for null profile", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          getTutorProfileById: mock(async () => null),
        },
      });
      const service = createAdminTutorService(deps as any);
      await expect(
        service.reviewTutorProfile("admin1", {
          tutorProfileId: "p1",
          action: "publish",
        }),
      ).rejects.toThrow(TutorProfileNotFoundError);
    });

    test("reviewTutorProfile publishes profile", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.reviewTutorProfile("admin1", {
        tutorProfileId: "p1",
        action: "publish",
      });
      expect(result.id).toBe("p1");
    });

    test("reviewTutorProfile with adminNote", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);
      const result = await service.reviewTutorProfile("admin1", {
        tutorProfileId: "p1",
        action: "request_changes",
        adminNote: "Please update bio",
      });
      expect(result.id).toBe("p1");
    });

    test("rejects approving edits when there are no pending changes", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);

      await expect(
        service.reviewTutorProfile("admin1", {
          tutorProfileId: "p1",
          action: "approve_edits",
        }),
      ).rejects.toThrow(InvalidInviteActionError);
    });

    test("rejects requesting edit changes when there are no pending changes", async () => {
      const deps = makeDeps();
      const service = createAdminTutorService(deps as any);

      await expect(
        service.reviewTutorProfile("admin1", {
          tutorProfileId: "p1",
          action: "request_edit_changes",
        }),
      ).rejects.toThrow(InvalidInviteActionError);
    });

    test("rejects approving edits with malformed subject ids", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          getTutorProfileById: mock(async () =>
            makeProfile({ pendingProfileChanges: { subjectIds: ["s1", 3] } }),
          ),
        },
      });
      const service = createAdminTutorService(deps as any);

      await expect(
        service.reviewTutorProfile("admin1", {
          tutorProfileId: "p1",
          action: "approve_edits",
        }),
      ).rejects.toThrow(InvalidInviteActionError);
    });

    test("approves pending profile edits and replaces subjects", async () => {
      const listActiveChildSubjects = mock(async () => [{ id: "s1" }]);
      const replaceTutorProfileSubjects = mock(async () => []);
      const updateTutorProfile = mock(async () =>
        makeProfile({
          onboardingStatus: "published",
        }),
      );
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          getTutorProfileById: mock(async () =>
            makeProfile({
              pendingProfileChanges: { bio: "updated", subjectIds: ["s1"] },
            }),
          ),
          listActiveChildSubjects,
          replaceTutorProfileSubjects,
          updateTutorProfile,
        },
      });
      const service = createAdminTutorService(deps as any);

      const result = await service.reviewTutorProfile("admin1", {
        tutorProfileId: "p1",
        action: "approve_edits",
      });

      expect(result.onboardingStatus).toBe("published");
      expect(listActiveChildSubjects).toHaveBeenCalledWith(expect.anything(), [
        "s1",
      ]);
      expect(replaceTutorProfileSubjects).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        ["s1"],
      );
      expect(updateTutorProfile).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        expect.objectContaining({
          onboardingStatus: "published",
          pendingProfileChanges: null,
          profileEditStatus: "none",
        }),
      );
    });

    test("requests edit changes only when pending changes exist", async () => {
      const deps = makeDeps({
        adminTutorRepo: {
          ...makeDeps().adminTutorRepo,
          getTutorProfileById: mock(async () =>
            makeProfile({ pendingProfileChanges: { bio: "updated" } }),
          ),
        },
      });
      const service = createAdminTutorService(deps as any);

      await expect(
        service.reviewTutorProfile("admin1", {
          tutorProfileId: "p1",
          action: "request_edit_changes",
          adminNote: "Please add more detail",
        }),
      ).resolves.toMatchObject({ id: "p1" });
    });
  });
});
