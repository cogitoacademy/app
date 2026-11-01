import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  availabilitySlot,
  auditLog,
  booking as bookingTable,
  subjectCategory,
  tutorInvite,
  tutorProfile,
  tutorProfileSubject,
  wallet,
} from "@cogito-app/db/schema";
import { services } from "../../services";
import { getCompetitionCatalogEntryBySlug } from "../../modules/competition-catalog/competition-catalog.repo";
import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

const paletteOne = {
  lightTextColor: "oklch(1 0 0)",
  lightBackgroundColor: "oklch(0.695641 0.132326 232.54)",
  darkTextColor: "oklch(1 0 0)",
  darkBackgroundColor: "oklch(0.695641 0.132326 232.54)",
};

const paletteTwo = {
  lightTextColor: "oklch(0.2036 0.0029 247.97)",
  lightBackgroundColor: "oklch(0.804266 0.214364 151.41)",
  darkTextColor: "oklch(0.2036 0.0029 247.97)",
  darkBackgroundColor: "oklch(0.804266 0.214364 151.41)",
};

const paletteBackfillCases = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    slug: "competition-model-united-nations",
    isActive: true,
    palette: {
      lightTextColor: "oklch(1 0 0)",
      lightBackgroundColor: "oklch(0.695641 0.132326 232.54)",
      darkTextColor: "oklch(1 0 0)",
      darkBackgroundColor: "oklch(0.695641 0.132326 232.54)",
    },
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    slug: "competition-world-scholars-cup",
    isActive: true,
    palette: {
      lightTextColor: "oklch(1 0 0)",
      lightBackgroundColor: "oklch(0.884795 0.181642 94.9)",
      darkTextColor: "oklch(1 0 0)",
      darkBackgroundColor: "oklch(0.884795 0.181642 94.9)",
    },
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    slug: "competition-essay-writing",
    isActive: true,
    palette: {
      lightTextColor: "oklch(1 0 0)",
      lightBackgroundColor: "oklch(0.698358 0.202646 44.07)",
      darkTextColor: "oklch(1 0 0)",
      darkBackgroundColor: "oklch(0.698358 0.202646 44.07)",
    },
  },
  {
    id: "30000000-0000-4000-8000-000000000004",
    slug: "competition-debate",
    isActive: true,
    palette: {
      lightTextColor: "oklch(1 0 0)",
      lightBackgroundColor: "oklch(0.581114 0.199813 315.44)",
      darkTextColor: "oklch(1 0 0)",
      darkBackgroundColor: "oklch(0.581114 0.199813 315.44)",
    },
  },
  {
    id: "30000000-0000-4000-8000-000000000005",
    slug: "competition-business",
    isActive: true,
    palette: {
      lightTextColor: "oklch(0.2036 0.0029 247.97)",
      lightBackgroundColor: "oklch(0.804266 0.214364 151.41)",
      darkTextColor: "oklch(0.2036 0.0029 247.97)",
      darkBackgroundColor: "oklch(0.804266 0.214364 151.41)",
    },
  },
  {
    id: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad",
    isActive: true,
    palette: {
      lightTextColor: "oklch(1 0 0)",
      lightBackgroundColor: "oklch(0.566845 0.202167 31.43)",
      darkTextColor: "oklch(1 0 0)",
      darkBackgroundColor: "oklch(0.566845 0.202167 31.43)",
    },
  },
  {
    id: "30000000-0000-4000-8000-000000000007",
    slug: "competition-public-speaking",
    isActive: true,
    palette: {
      lightTextColor: "oklch(1 0 0)",
      lightBackgroundColor: "oklch(0.773372 0.101596 354.57)",
      darkTextColor: "oklch(1 0 0)",
      darkBackgroundColor: "oklch(0.773372 0.101596 354.57)",
    },
  },
] as const;

async function waitForBlockedQuery(fragment: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- poll the DB until the lock wait is visible
    const result = await db.execute(sql`
      SELECT query, wait_event_type
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
    `);
    const rows = (
      Array.isArray(result)
        ? result
        : ((result as unknown as { rows?: unknown[] }).rows ?? [])
    ) as Array<{
      query: string;
      wait_event_type: string | null;
    }>;
    if (
      rows.some((row) =>
        row.query.toLowerCase().includes(fragment.toLowerCase()),
      )
    ) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop -- keep polling intervals ordered
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Timed out waiting for a blocked query containing ${fragment}`,
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function holdSubjectCategoryRow(id: string) {
  const acquired = deferred();
  const release = deferred();
  const transaction = db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM subject_category WHERE id = ${id} FOR UPDATE`,
    );
    acquired.resolve();
    await release.promise;
  });
  await acquired.promise;
  return { release: release.resolve, transaction };
}

async function holdWalletRow(userId: string) {
  const acquired = deferred();
  const release = deferred();
  const transaction = db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM wallet WHERE user_id = ${userId} FOR UPDATE`,
    );
    acquired.resolve();
    await release.promise;
  });
  await acquired.promise;
  return { release: release.resolve, transaction };
}

describe("competition catalog PostgreSQL CRUD", () => {
  let admin: ReturnType<typeof createTestClient>;
  let adminUserId: string;

  beforeAll(async () => {
    await resetDatabase();
    const account = await signUpAndSignIn(
      "catalog.admin@cogito.test",
      "Test1234!",
      "Catalog Admin",
    );
    const context = await createTestContext(account.cookie);
    adminUserId = context.session!.user.id;
    await setUserRole(adminUserId, "admin");
    admin = createTestClient(await createTestContext(account.cookie));
  });

  test("uses current parent palettes and carries colors through two-level CRUD", async () => {
    const paletteRows = await Promise.all(
      paletteBackfillCases.map((expected) =>
        getCompetitionCatalogEntryBySlug(db, expected.slug),
      ),
    );
    paletteRows.forEach((row, index) => {
      const expected = paletteBackfillCases[index]!;
      expect(row).toMatchObject({
        id: expected.id,
        slug: expected.slug,
        parentId: null,
        isActive: expected.isActive,
        ...expected.palette,
      });
    });
    const childWithoutPalette = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.slug, "competition-mun-research"),
    });
    expect(childWithoutPalette).toMatchObject({
      lightTextColor: null,
      lightBackgroundColor: null,
      darkTextColor: null,
      darkBackgroundColor: null,
    });

    const legacyRoot = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.slug, "competition-model-united-nations"),
      with: { children: true },
    });
    expect(legacyRoot).toBeDefined();
    expect(legacyRoot).toMatchObject({
      lightTextColor: "oklch(1 0 0)",
      lightBackgroundColor: "oklch(0.695641 0.132326 232.54)",
      darkTextColor: "oklch(1 0 0)",
      darkBackgroundColor: "oklch(0.695641 0.132326 232.54)",
    });
    const resolved =
      await services.competitionCatalog.resolveCompetitionPalette({
        id: legacyRoot!.children[0]?.id,
        slug: "business",
      });
    expect(resolved).toEqual(paletteOne);

    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const firstParent = await admin.admin.createCompetitionParent({
      slug: `competition-catalog-test-${suffix}-a`,
      name: "Catalog Test A",
      ...paletteOne,
      sortOrder: 900,
      reason: "Exercise competition catalog CRUD",
    });
    expect(firstParent).toMatchObject({
      isActive: false,
      version: 1,
      parentColors: paletteOne,
    });

    const secondParent = await admin.admin.createCompetitionParent({
      slug: `competition-catalog-test-${suffix}-b`,
      name: "Catalog Test B",
      ...paletteTwo,
      sortOrder: 910,
      reason: "Exercise catalog reparenting",
    });
    expect(secondParent.isActive).toBe(false);

    const specialization = await admin.admin.createCompetitionSpecialization({
      parentId: firstParent.id,
      slug: `catalog-test-specialization-${suffix}`,
      name: "Catalog Test Specialization",
      sortOrder: 1,
      reason: "Create child under the draft competition",
    });
    expect(specialization).toMatchObject({
      parentId: firstParent.id,
      isActive: false,
      parentColors: paletteOne,
      version: 1,
    });

    const updatedParent = await admin.admin.updateCompetitionCatalogEntry({
      id: firstParent.id,
      expectedVersion: firstParent.version,
      lightBackgroundColor: "oklch(0.72 0.12 230)",
      nameId: "Kompetisi Uji A",
      reason: "Update palette and localized name",
    });
    const expectedUpdatedPalette = {
      ...paletteOne,
      lightBackgroundColor: "oklch(0.72 0.12 230)",
    };
    expect(updatedParent).toMatchObject({
      nameId: "Kompetisi Uji A",
      version: 2,
      parentColors: expectedUpdatedPalette,
    });

    const moved = await admin.admin.moveCompetitionSpecialization({
      id: specialization.id,
      parentId: secondParent.id,
      expectedVersion: specialization.version,
      reason: "Move unused specialization",
    });
    expect(moved).toMatchObject({
      parentId: secondParent.id,
      isActive: false,
      parentColors: paletteTwo,
      version: 2,
    });

    const impact = await admin.admin.previewCompetitionCatalogImpact({
      id: secondParent.id,
    });
    expect(impact.childCount).toBe(1);
    expect(impact.entry.parentColors).toEqual(paletteTwo);

    await admin.admin.deleteCompetitionCatalogEntry({
      id: moved.id,
      expectedVersion: moved.version,
      reason: "Remove unused test specialization",
    });
    await admin.admin.deleteCompetitionCatalogEntry({
      id: firstParent.id,
      expectedVersion: updatedParent.version,
      reason: "Remove unused test competition A",
    });
    await admin.admin.deleteCompetitionCatalogEntry({
      id: secondParent.id,
      expectedVersion: secondParent.version,
      reason: "Remove unused test competition B",
    });
  });

  test("archives only the parent and restores its preserved selectable child flags", async () => {
    const entries = await admin.admin.listCompetitionCatalog({
      query: "competition-model-united-nations",
      includeArchived: true,
    });
    const root = entries.find(
      (entry) => entry.slug === "competition-model-united-nations",
    );
    expect(root).toBeDefined();
    const fullRoot = await admin.admin.getCompetitionCatalogEntry({
      id: root!.id,
    });
    const childBefore = await admin.admin.getCompetitionCatalogEntry({
      id: fullRoot.children[0]!.id,
    });
    const wasActive = root!.isActive;
    if (!wasActive) {
      await admin.admin.restoreCompetitionCatalogEntry({
        id: root!.id,
        expectedVersion: root!.version,
        reason: "Prepare legacy competition archive check",
      });
    }
    const readyRoot = await admin.admin.getCompetitionCatalogEntry({
      id: root!.id,
    });
    const activeChild = await admin.admin.getCompetitionCatalogEntry({
      id: childBefore.id,
    });
    let archived = false;
    try {
      const result = await admin.admin.archiveCompetitionCatalogEntry({
        id: readyRoot.id,
        expectedVersion: readyRoot.version,
        reason: "Verify parent archival preserves children",
      });
      archived = true;
      expect(result.entry.isActive).toBe(false);
      const hiddenChild = await admin.admin.getCompetitionCatalogEntry({
        id: activeChild.id,
      });
      expect(hiddenChild.isActive).toBe(activeChild.isActive);
      expect(hiddenChild.selectable).toBe(false);

      const restored = await admin.admin.restoreCompetitionCatalogEntry({
        id: result.entry.id,
        expectedVersion: result.entry.version,
        reason: "Restore rate-ready legacy competition",
      });
      archived = false;
      expect(restored.entry.isActive).toBe(true);
      const visibleChild = await admin.admin.getCompetitionCatalogEntry({
        id: activeChild.id,
      });
      expect(visibleChild.isActive).toBe(activeChild.isActive);
      expect(visibleChild.parentColors).toEqual(paletteOne);
    } finally {
      if (archived) {
        const current = await admin.admin.getCompetitionCatalogEntry({
          id: readyRoot.id,
        });
        await admin.admin.restoreCompetitionCatalogEntry({
          id: current.id,
          expectedVersion: current.version,
          reason: "Restore legacy competition after integration assertion",
        });
      }
    }
  });

  test("historical tutor profile audits keep removed specializations in use", async () => {
    const research = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.slug, "competition-mun-research"),
    });
    const writing = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.slug, "competition-mun-writing"),
    });
    const negotiation = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.slug, "competition-mun-negotiation"),
    });
    const destination = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.slug, "competition-world-scholars-cup"),
    });
    expect(research?.isActive).toBe(true);
    expect(writing?.isActive).toBe(true);
    expect(negotiation?.isActive).toBe(true);
    expect(destination?.isActive).toBe(true);
    if (!research || !writing || !negotiation || !destination) {
      throw new Error("Expected seeded competition catalog fixtures");
    }

    const email = `catalog.tutor.${crypto.randomUUID()}@cogito.test`;
    const account = await signUpAndSignIn(email, "Test1234!", "Catalog Tutor");
    const context = await createTestContext(account.cookie);
    const tutorId = context.session?.user.id;
    if (!tutorId) throw new Error("Tutor session not found");
    await setUserRole(tutorId, "tutor");
    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email,
        displayName: "Catalog Tutor",
        token: `catalog-${crypto.randomUUID()}`,
        status: "accepted",
        invitedBy: tutorId,
        acceptedBy: tutorId,
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    if (!invite) throw new Error("Tutor invite fixture was not created");
    const [profile] = await db
      .insert(tutorProfile)
      .values({ userId: tutorId, inviteId: invite.id })
      .returning();
    if (!profile) throw new Error("Tutor profile fixture was not created");

    const assigned = await services.tutor.updateMyProfile(tutorId, {
      version: profile.version,
      subjectIds: [research.id, writing.id],
    });
    const removed = await services.tutor.updateMyProfile(tutorId, {
      version: assigned.version,
      subjectIds: [writing.id],
    });
    expect(removed.subjects.map((entry) => entry.id)).toEqual([writing.id]);
    expect(
      await db.query.tutorProfileSubject.findMany({
        where: eq(tutorProfileSubject.tutorProfileId, profile.id),
      }),
    ).toHaveLength(1);

    const impact = await admin.admin.previewCompetitionCatalogImpact({
      id: research.id,
    });
    expect(impact.references.tutorAssignments).toBe(0);
    expect(impact.references.historicalTutorProfileAudits).toBeGreaterThan(0);

    await expect(
      admin.admin.moveCompetitionSpecialization({
        id: research.id,
        parentId: destination.id,
        expectedVersion: research.version,
        reason: "Historical profile use must prevent a move",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      admin.admin.deleteCompetitionCatalogEntry({
        id: research.id,
        expectedVersion: research.version,
        reason: "Historical profile use must prevent deletion",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    let releaseProfileLock!: () => void;
    let signalProfileLock!: () => void;
    const profileLockReady = new Promise<void>((resolve) => {
      signalProfileLock = resolve;
    });
    const profileLockRelease = new Promise<void>((resolve) => {
      releaseProfileLock = resolve;
    });
    const profileLockTransaction = db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM tutor_profile WHERE id = ${profile.id} FOR UPDATE`,
      );
      signalProfileLock();
      await profileLockRelease;
    });
    await profileLockReady;

    let assignmentSettled = false;
    let deletionSettled = false;
    const assignmentPromise = services.tutor
      .updateMyProfile(tutorId, {
        version: removed.version,
        subjectIds: [writing.id, negotiation.id],
      })
      .finally(() => {
        assignmentSettled = true;
      });
    let deletionPromise: Promise<unknown> | undefined;
    try {
      await waitForBlockedQuery('update "tutor_profile"');
      deletionPromise = admin.admin
        .deleteCompetitionCatalogEntry({
          id: negotiation.id,
          expectedVersion: negotiation.version,
          reason: "Serialize delete after in-flight tutor assignment",
        })
        .finally(() => {
          deletionSettled = true;
        });
      await waitForBlockedQuery("pg_advisory_xact_lock");
      expect(assignmentSettled).toBe(false);
      expect(deletionSettled).toBe(false);
    } finally {
      releaseProfileLock();
      await profileLockTransaction;
      await Promise.allSettled([
        assignmentPromise,
        ...(deletionPromise ? [deletionPromise] : []),
      ]);
    }
    const racedAssignment = await assignmentPromise;
    expect(racedAssignment.subjects.map((entry) => entry.id)).toContain(
      negotiation.id,
    );
    await expect(deletionPromise).rejects.toMatchObject({ code: "CONFLICT" });

    const stillPresent = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.id, research.id),
    });
    expect(stillPresent?.parentId).toBe(research.parentId);

    const reverseRaceTopic = await admin.admin.createCompetitionSpecialization({
      parentId: research.parentId!,
      slug: `catalog-delete-first-${crypto.randomUUID().slice(0, 8)}`,
      name: "Delete-first serialization fixture",
      sortOrder: 900,
      reason: "Exercise deletion winning the catalog lock race",
    });
    expect(reverseRaceTopic.isActive).toBe(true);
    const topicRowLock = await holdSubjectCategoryRow(reverseRaceTopic.id);
    const reverseDelete = admin.admin
      .deleteCompetitionCatalogEntry({
        id: reverseRaceTopic.id,
        expectedVersion: reverseRaceTopic.version,
        reason: "Delete before a queued tutor assignment",
      })
      .then((value) => ({ ok: true as const, value }));
    let reverseAssignment:
      | Promise<{ ok: true; value: unknown }>
      | Promise<{ ok: false; error: unknown }>;
    try {
      await waitForBlockedQuery('delete from "subject_category"');
      reverseAssignment = services.tutor
        .updateMyProfile(tutorId, {
          version: racedAssignment.version,
          subjectIds: [writing.id, negotiation.id, reverseRaceTopic.id],
        })
        .then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        );
      await waitForBlockedQuery("pg_advisory_xact_lock");
    } finally {
      topicRowLock.release();
      await topicRowLock.transaction;
    }
    const [deletedTopic, assignmentAfterDelete] = await Promise.all([
      reverseDelete,
      reverseAssignment!,
    ]);
    expect(deletedTopic.ok).toBe(true);
    expect(assignmentAfterDelete.ok).toBe(false);
    if (assignmentAfterDelete.ok) {
      throw new Error("Assignment unexpectedly added a deleted specialization");
    }
    expect(assignmentAfterDelete.error).toMatchObject({
      code: "INVALID_TUTOR_SUBJECT_SELECTION",
    });
    const retainedAssignments = await db.query.tutorProfileSubject.findMany({
      where: eq(tutorProfileSubject.tutorProfileId, profile.id),
    });
    expect(
      retainedAssignments.map((entry) => entry.subjectId).toSorted(),
    ).toEqual([negotiation.id, writing.id].toSorted());
  });

  test("serializes stale concurrent admin edits by catalog version", async () => {
    const parent = await admin.admin.createCompetitionParent({
      slug: `competition-catalog-stale-${crypto.randomUUID().slice(0, 8)}`,
      name: "Stale Edit Fixture",
      ...paletteOne,
      reason: "Prepare the concurrent edit version check",
    });
    const rowLock = await holdSubjectCategoryRow(parent.id);
    let winnerPromise: Promise<unknown> | undefined;
    let stalePromise: Promise<unknown> | undefined;
    try {
      winnerPromise = admin.admin.updateCompetitionCatalogEntry({
        id: parent.id,
        expectedVersion: parent.version,
        name: "Serialized Winner",
        reason: "Win the catalog edit race",
      });
      await waitForBlockedQuery('update "subject_category"');
      stalePromise = admin.admin.updateCompetitionCatalogEntry({
        id: parent.id,
        expectedVersion: parent.version,
        name: "Stale Loser",
        reason: "Reject the stale concurrent catalog edit",
      });
      await waitForBlockedQuery("pg_advisory_xact_lock");
    } finally {
      rowLock.release();
      await rowLock.transaction;
      await Promise.allSettled(
        [winnerPromise, stalePromise].filter(
          (promise): promise is Promise<unknown> => promise !== undefined,
        ),
      );
    }

    const winner = (await winnerPromise) as { version: number };
    await expect(stalePromise).rejects.toMatchObject({ code: "CONFLICT" });
    const stored = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.id, parent.id),
    });
    expect(stored).toMatchObject({
      name: "Serialized Winner",
      version: winner.version,
    });
    expect(
      await db.query.auditLog.findMany({
        where: eq(auditLog.targetId, parent.id),
      }),
    ).toHaveLength(2);

    await admin.admin.deleteCompetitionCatalogEntry({
      id: parent.id,
      expectedVersion: winner.version,
      reason: "Clean up stale edit fixture",
    });
  });

  test("serializes booking sessionTopic JSON against catalog archive", async () => {
    const topicA = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.slug, "competition-mun-research"),
    });
    const topicB = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.slug, "competition-mun-writing"),
    });
    if (
      !topicA ||
      !topicB ||
      !topicA.parentId ||
      topicA.parentId !== topicB.parentId
    ) {
      throw new Error("Expected active MUN topic fixtures");
    }
    expect(topicA.isActive).toBe(true);
    expect(topicB.isActive).toBe(true);

    const tutorEmail = `catalog.booking.tutor.${crypto.randomUUID()}@cogito.test`;
    const tutorAccount = await signUpAndSignIn(
      tutorEmail,
      "Test1234!",
      "Catalog Booking Tutor",
    );
    const tutorContext = await createTestContext(tutorAccount.cookie);
    const tutorId = tutorContext.session!.user.id;
    await setUserRole(tutorId, "tutor");
    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email: tutorEmail,
        displayName: "Catalog Booking Tutor",
        token: `catalog-booking-${crypto.randomUUID()}`,
        status: "accepted",
        invitedBy: tutorId,
        acceptedBy: tutorId,
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    if (!invite)
      throw new Error("Booking tutor invite fixture was not created");
    const [profile] = await db
      .insert(tutorProfile)
      .values({
        userId: tutorId,
        inviteId: invite.id,
        shortBio: "A published tutor for catalog booking races",
        modality: "both",
        prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
        onboardingStatus: "published",
        publishedAt: new Date(),
      })
      .returning();
    if (!profile)
      throw new Error("Booking tutor profile fixture was not created");
    await db.insert(tutorProfileSubject).values([
      { tutorProfileId: profile.id, subjectId: topicA.id },
      { tutorProfileId: profile.id, subjectId: topicB.id },
    ]);

    const studentEmail = `catalog.booking.student.${crypto.randomUUID()}@cogito.test`;
    const studentAccount = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Catalog Booking Student",
    );
    const studentId = (await createTestContext(studentAccount.cookie)).session!
      .user.id;
    const studentWallet = await services.wallet.getOrCreate(studentId);
    await db
      .update(wallet)
      .set({ totalBalance: 300, availableBalance: 300 })
      .where(eq(wallet.id, studentWallet.id));
    const slotStart = new Date(Date.now() + 2 * 60 * 60_000);
    const slotEnd = new Date(slotStart.getTime() + 8 * 24 * 60 * 60_000);
    const [slot] = await db
      .insert(availabilitySlot)
      .values({
        tutorId,
        startDate: slotStart,
        endDate: slotEnd,
        modality: "both",
      })
      .returning();
    if (!slot) throw new Error("Availability fixture was not created");

    const createTopicBooking = (topicId: string, daysFromNow: number) => {
      const start = new Date(Date.now() + daysFromNow * 24 * 60 * 60_000);
      return services.booking.createSolo(studentId, {
        tutorId,
        availabilitySlotId: slot.id,
        modality: "online",
        scheduledStartAt: start,
        scheduledEndAt: new Date(start.getTime() + 60 * 60_000),
        subjectId: topicId,
        timezone: "Asia/Jakarta",
      });
    };

    const walletRowLock = await holdWalletRow(studentId);
    let bookingFirstPromise: ReturnType<typeof createTopicBooking> | undefined;
    let archiveAfterBooking:
      | ReturnType<typeof admin.admin.archiveCompetitionCatalogEntry>
      | undefined;
    try {
      bookingFirstPromise = createTopicBooking(topicA.id, 1);
      await waitForBlockedQuery('update "wallet"');
      archiveAfterBooking = admin.admin.archiveCompetitionCatalogEntry({
        id: topicA.id,
        expectedVersion: topicA.version,
        reason: "Archive after the in-flight booking captures its topic JSON",
      });
      await waitForBlockedQuery("pg_advisory_xact_lock");
    } finally {
      walletRowLock.release();
      await walletRowLock.transaction;
      await Promise.allSettled(
        [bookingFirstPromise, archiveAfterBooking].filter(
          (promise): promise is NonNullable<typeof promise> =>
            promise !== undefined,
        ),
      );
    }
    const [bookingFirst, archivedAfterBooking] = await Promise.all([
      bookingFirstPromise!,
      archiveAfterBooking!,
    ]);
    expect(archivedAfterBooking.entry.isActive).toBe(false);
    expect(archivedAfterBooking.affected.references.bookings).toBe(1);
    const storedBooking = await db.query.booking.findFirst({
      where: eq(bookingTable.id, bookingFirst.id),
    });
    expect(storedBooking?.sessionTopic).toMatchObject({
      categoryId: topicA.parentId,
      subcategoryId: topicA.id,
      subcategorySlug: topicA.slug,
    });

    const topicARestored = await admin.admin.restoreCompetitionCatalogEntry({
      id: topicA.id,
      expectedVersion: archivedAfterBooking.entry.version,
      reason: "Restore topic after booking/archive ordering assertion",
    });
    expect(topicARestored.entry.isActive).toBe(true);

    const topicBRowLock = await holdSubjectCategoryRow(topicB.id);
    let archiveBeforeBooking:
      | ReturnType<typeof admin.admin.archiveCompetitionCatalogEntry>
      | undefined;
    let bookingAfterArchive:
      | Promise<
          | { ok: true; value: Awaited<ReturnType<typeof createTopicBooking>> }
          | { ok: false; error: unknown }
        >
      | undefined;
    try {
      archiveBeforeBooking = admin.admin.archiveCompetitionCatalogEntry({
        id: topicB.id,
        expectedVersion: topicB.version,
        reason: "Archive before the queued booking resolves its topic JSON",
      });
      await waitForBlockedQuery('update "subject_category"');
      bookingAfterArchive = createTopicBooking(topicB.id, 2).then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
      await waitForBlockedQuery("pg_advisory_xact_lock");
    } finally {
      topicBRowLock.release();
      await topicBRowLock.transaction;
      await Promise.allSettled(
        [archiveBeforeBooking, bookingAfterArchive].filter(
          (promise): promise is NonNullable<typeof promise> =>
            promise !== undefined,
        ),
      );
    }
    const [archivedBeforeBooking, bookingAfterArchiveResult] =
      await Promise.all([archiveBeforeBooking!, bookingAfterArchive!]);
    expect(archivedBeforeBooking.entry.isActive).toBe(false);
    expect(bookingAfterArchiveResult.ok).toBe(false);
    if (bookingAfterArchiveResult.ok) {
      throw new Error(
        "Booking unexpectedly used a specialization archived first",
      );
    }
    expect(bookingAfterArchiveResult.error).toMatchObject({
      code: "BOOKING_NOT_EDITABLE",
    });
    expect(
      await db.query.booking.findFirst({
        where: sql`${bookingTable.sessionTopic}->>'subcategoryId' = ${topicB.id}`,
      }),
    ).toBeUndefined();
    const topicBRestored = await admin.admin.restoreCompetitionCatalogEntry({
      id: topicB.id,
      expectedVersion: archivedBeforeBooking.entry.version,
      reason: "Restore topic after archive/booking ordering assertion",
    });
    expect(topicBRestored.entry.isActive).toBe(true);
  });

  test("denies non-admin writes and rolls back catalog changes if audit fails", async () => {
    const parent = await admin.admin.createCompetitionParent({
      slug: `competition-catalog-audit-${crypto.randomUUID().slice(0, 8)}`,
      name: "Audit Rollback Test",
      ...paletteOne,
      reason: "Prepare authorization and audit rollback check",
    });
    const studentEmail = `catalog.student.${crypto.randomUUID()}@cogito.test`;
    const student = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Catalog Student",
    );
    const studentClient = createTestClient(
      await createTestContext(student.cookie),
    );

    await expect(
      studentClient.admin.deleteCompetitionCatalogEntry({
        id: parent.id,
        expectedVersion: parent.version,
        reason: "Non-admin cannot delete catalog rows",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await db.query.auditLog.findMany({
        where: eq(auditLog.targetId, parent.id),
      }),
    ).toHaveLength(1);

    const beforeAuditFailure = services.audit.record;
    services.audit.record = async () => {
      throw new Error("forced catalog audit failure");
    };
    try {
      await expect(
        services.competitionCatalog.update(adminUserId, {
          id: parent.id,
          expectedVersion: parent.version,
          name: "Must Roll Back",
          reason: "Verify atomic audit behavior",
        }),
      ).rejects.toThrow("forced catalog audit failure");
    } finally {
      services.audit.record = beforeAuditFailure;
    }

    const unchanged = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.id, parent.id),
    });
    expect(unchanged).toMatchObject({
      name: "Audit Rollback Test",
      version: parent.version,
    });
    expect(
      await db.query.auditLog.findMany({
        where: eq(auditLog.targetId, parent.id),
      }),
    ).toHaveLength(1);

    await admin.admin.deleteCompetitionCatalogEntry({
      id: parent.id,
      expectedVersion: parent.version,
      reason: "Clean up unused audit rollback fixture",
    });
  });
});
