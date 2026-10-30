import { and as drizzleAnd, asc, eq, isNotNull } from "drizzle-orm";
import { resolve } from "node:path";

import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { env } from "@cogito-app/env/server";
import { isProductionLike } from "@cogito-app/env/node-env";
import {
  user,
  account,
  tutorInvite,
  booking,
  bookingParticipant,
  bookingSession,
  tutorProfile,
  availabilitySlot,
  economyV3Activation,
  subjectCategory,
  tutorProfileSubject,
} from "@cogito-app/db/schema";
import {
  INVITE_EXPIRY_DAYS,
  USER_ROLE,
} from "@cogito-app/api/shared/constants";
import {
  DEFAULT_V3_ECONOMY_CONFIG,
  v3EconomyConfigSchema,
} from "@cogito-app/api/modules/pricing/v3-economy.config";
import { calculateV3SessionPrice } from "@cogito-app/api/modules/pricing/v3-rate-card";
import {
  appendV3Revision,
  getActiveV3Revision,
  getLatestV3Revision,
} from "@cogito-app/api/modules/economy/economy.repo";
import { seedPackages } from "./seed-packages";
import { hashInviteToken } from "@cogito-app/api/lib/tokens";
import { parseConfiguredAdminEmails } from "@cogito-app/env/admin";

export const DEFAULT_SEED_TUTOR = {
  email: "cogito.diego@yopmail.com",
  name: "Diego by Cogito",
};

export const DEFAULT_SEED_STUDENTS = [
  { email: "cogito.andre@yopmail.com", name: "Andre by Cogito" },
  { email: "cogito.argya@yopmail.com", name: "Argya by Cogito" },
  { email: "cogito.athena@yopmail.com", name: "Athena by Cogito" },
] as const;

// Booking-flow E2E holds 126 Marks before T05 class-enrollment coverage.
const T05_E2E_STUDENT_INITIAL_MARKS = 326;

export function seedAllowed(
  nodeEnv: string,
  allowFlag: string | undefined,
): boolean {
  if (!isProductionLike(nodeEnv)) return true;
  return allowFlag === "true";
}

export function seedAdminPassword(value: string | undefined): string | null {
  if (!value || value.length < 12) return null;
  return value;
}

export function resolveSeedAdminEmail(
  nodeEnv: string,
  reviewEmail?: string,
): string {
  if (!isProductionLike(nodeEnv)) return "admin@cogitoacademy.id";
  return reviewEmail?.trim().toLowerCase() || "review.admin@cogitoacademy.id";
}

export function assertReviewAdminIsSeparate(
  reviewEmail: string,
  configuredAdminEmails?: string,
) {
  if (parseConfiguredAdminEmails(configuredAdminEmails).includes(reviewEmail)) {
    throw new Error(
      "SEED_REVIEW_ADMIN_EMAIL must not be an operator email from ADMIN_EMAILS",
    );
  }
}

function demoPassword(envValue: string | undefined, fallback: string): string {
  if (!envValue) return fallback;
  if (envValue.length < 8) {
    throw new Error(
      "SEED_TUTOR_PASSWORD / SEED_STUDENT_PASSWORD must be at least 8 characters",
    );
  }
  return envValue;
}

export function requireProductionReviewPassword(
  nodeEnv: string,
  name: string,
  value: string | undefined,
) {
  if (!isProductionLike(nodeEnv)) return;
  if (!value || value.length < 12) {
    throw new Error(`${name} is required and must be at least 12 characters`);
  }
}

// Canonical taxonomy from migrations 0029/0047; parent palettes from 0056.
const COMPETITION_TYPES = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    parentId: null,
    slug: "competition-model-united-nations",
    name: "Model United Nations",
    sortOrder: 10,
    isActive: true,
    lightTextColor: "oklch(1 0 0)",
    lightBackgroundColor: "oklch(0.695641 0.132326 232.54)",
    darkTextColor: "oklch(1 0 0)",
    darkBackgroundColor: "oklch(0.695641 0.132326 232.54)",
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    parentId: null,
    slug: "competition-world-scholars-cup",
    name: "World Scholar’s Cup",
    sortOrder: 20,
    isActive: true,
    lightTextColor: "oklch(1 0 0)",
    lightBackgroundColor: "oklch(0.884795 0.181642 94.9)",
    darkTextColor: "oklch(1 0 0)",
    darkBackgroundColor: "oklch(0.884795 0.181642 94.9)",
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    parentId: null,
    slug: "competition-essay-writing",
    name: "Essay & Writing",
    sortOrder: 30,
    isActive: true,
    lightTextColor: "oklch(1 0 0)",
    lightBackgroundColor: "oklch(0.698358 0.202646 44.07)",
    darkTextColor: "oklch(1 0 0)",
    darkBackgroundColor: "oklch(0.698358 0.202646 44.07)",
  },
  {
    id: "30000000-0000-4000-8000-000000000004",
    parentId: null,
    slug: "competition-debate",
    name: "Debate",
    sortOrder: 40,
    isActive: true,
    lightTextColor: "oklch(1 0 0)",
    lightBackgroundColor: "oklch(0.581114 0.199813 315.44)",
    darkTextColor: "oklch(1 0 0)",
    darkBackgroundColor: "oklch(0.581114 0.199813 315.44)",
  },
  {
    id: "30000000-0000-4000-8000-000000000005",
    parentId: null,
    slug: "competition-business",
    name: "Business",
    sortOrder: 50,
    isActive: true,
    lightTextColor: "oklch(0.2036 0.0029 247.97)",
    lightBackgroundColor: "oklch(0.804266 0.214364 151.41)",
    darkTextColor: "oklch(0.2036 0.0029 247.97)",
    darkBackgroundColor: "oklch(0.804266 0.214364 151.41)",
  },
  {
    id: "30000000-0000-4000-8000-000000000006",
    parentId: null,
    slug: "competition-olympiad",
    name: "Olympiad",
    sortOrder: 60,
    isActive: true,
    lightTextColor: "oklch(1 0 0)",
    lightBackgroundColor: "oklch(0.566845 0.202167 31.43)",
    darkTextColor: "oklch(1 0 0)",
    darkBackgroundColor: "oklch(0.566845 0.202167 31.43)",
  },
  {
    id: "30000000-0000-4000-8000-000000000007",
    parentId: null,
    slug: "competition-public-speaking",
    name: "Public Speaking",
    sortOrder: 70,
    isActive: true,
    lightTextColor: "oklch(1 0 0)",
    lightBackgroundColor: "oklch(0.773372 0.101596 354.57)",
    darkTextColor: "oklch(1 0 0)",
    darkBackgroundColor: "oklch(0.773372 0.101596 354.57)",
  },
  {
    id: "40000000-0000-4000-8000-000000000001",
    parentId: "30000000-0000-4000-8000-000000000001",
    slug: "competition-mun-research",
    name: "Research",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    parentId: "30000000-0000-4000-8000-000000000001",
    slug: "competition-mun-writing",
    name: "Writing",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000003",
    parentId: "30000000-0000-4000-8000-000000000001",
    slug: "competition-mun-speech",
    name: "Speech",
    sortOrder: 30,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000004",
    parentId: "30000000-0000-4000-8000-000000000001",
    slug: "competition-mun-negotiation",
    name: "Negotiation",
    sortOrder: 40,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000005",
    parentId: "30000000-0000-4000-8000-000000000002",
    slug: "competition-wsc-writing",
    name: "Writing",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000006",
    parentId: "30000000-0000-4000-8000-000000000002",
    slug: "competition-wsc-debate",
    name: "Debate",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000007",
    parentId: "30000000-0000-4000-8000-000000000002",
    slug: "competition-wsc-subjects",
    name: "Subjects",
    sortOrder: 30,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000008",
    parentId: "30000000-0000-4000-8000-000000000003",
    slug: "competition-essay-academic-essay",
    name: "Academic Essay",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000009",
    parentId: "30000000-0000-4000-8000-000000000003",
    slug: "competition-essay-creative-writing",
    name: "Creative Writing",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000010",
    parentId: "30000000-0000-4000-8000-000000000003",
    slug: "competition-essay-scientific-research",
    name: "Scientific Research",
    sortOrder: 30,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000011",
    parentId: "30000000-0000-4000-8000-000000000003",
    slug: "competition-essay-college-application-essay",
    name: "College Application Essay",
    sortOrder: 40,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000012",
    parentId: "30000000-0000-4000-8000-000000000003",
    slug: "competition-essay-journalistic-writing",
    name: "Journalistic Writing",
    sortOrder: 50,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000013",
    parentId: "30000000-0000-4000-8000-000000000004",
    slug: "competition-debate-british-parliamentary",
    name: "British Parliamentary",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000014",
    parentId: "30000000-0000-4000-8000-000000000004",
    slug: "competition-debate-asian-parliamentary",
    name: "Asian Parliamentary",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000015",
    parentId: "30000000-0000-4000-8000-000000000004",
    slug: "competition-debate-world-schools-wsdc",
    name: "World Schools (WSDC)",
    sortOrder: 30,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000016",
    parentId: "30000000-0000-4000-8000-000000000004",
    slug: "competition-debate-bahasa-indonesia-ldbi",
    name: "Bahasa Indonesia (LDBI)",
    sortOrder: 40,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000017",
    parentId: "30000000-0000-4000-8000-000000000005",
    slug: "competition-business-model-canvas",
    name: "Business Model Canvas",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000018",
    parentId: "30000000-0000-4000-8000-000000000005",
    slug: "competition-business-plan",
    name: "Business Plan",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000019",
    parentId: "30000000-0000-4000-8000-000000000005",
    slug: "competition-business-case",
    name: "Business Case",
    sortOrder: 30,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000020",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-mathematics-smp",
    name: "Mathematics (SMP)",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000021",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-natural-sciences-smp",
    name: "Natural Sciences (SMP)",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000022",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-social-sciences-smp",
    name: "Social Sciences (SMP)",
    sortOrder: 30,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000023",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-mathematics",
    name: "Mathematics",
    sortOrder: 40,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000024",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-physics",
    name: "Physics",
    sortOrder: 50,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000025",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-chemistry",
    name: "Chemistry",
    sortOrder: 60,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000026",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-biology",
    name: "Biology",
    sortOrder: 70,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000027",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-informatics",
    name: "Informatics",
    sortOrder: 80,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000028",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-astronomy",
    name: "Astronomy",
    sortOrder: 90,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000029",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-earth-sciences",
    name: "Earth Sciences",
    sortOrder: 100,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000030",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-economics",
    name: "Economics",
    sortOrder: 110,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000031",
    parentId: "30000000-0000-4000-8000-000000000006",
    slug: "competition-olympiad-geography",
    name: "Geography",
    sortOrder: 120,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000032",
    parentId: "30000000-0000-4000-8000-000000000007",
    slug: "competition-public-speaking-persuasive-speech",
    name: "Persuasive Speech",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000033",
    parentId: "30000000-0000-4000-8000-000000000007",
    slug: "competition-public-speaking-storytelling",
    name: "Storytelling",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "40000000-0000-4000-8000-000000000034",
    parentId: "30000000-0000-4000-8000-000000000004",
    slug: "competition-debate-law",
    name: "Law Debate",
    sortOrder: 50,
    isActive: true,
  },
];

async function seedCompetitionTypes() {
  await db.transaction(async (tx) => {
    const parentIds = new Map<string, string>();
    for (const entry of COMPETITION_TYPES.filter(
      (item) => item.parentId === null,
    )) {
      await tx
        .insert(subjectCategory)
        .values(entry)
        .onConflictDoNothing({ target: subjectCategory.slug });
      const [parent] = await tx
        .select({ id: subjectCategory.id })
        .from(subjectCategory)
        .where(eq(subjectCategory.slug, entry.slug));
      parentIds.set(entry.id, parent!.id);
    }
    await tx
      .insert(subjectCategory)
      .values(
        COMPETITION_TYPES.filter((item) => item.parentId !== null).map(
          (entry) => ({
            ...entry,
            parentId: parentIds.get(entry.parentId!)!,
          }),
        ),
      )
      .onConflictDoNothing({ target: subjectCategory.slug });
  });
}

async function ensureUser(email: string, password: string, name: string) {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing[0]) {
    const linkedAccounts = await db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, existing[0].id));
    const localCredential = linkedAccounts.some(
      (linked) => linked.providerId === "credential",
    );
    if (!localCredential) {
      throw new Error(
        `Review user ${email} already exists without a local credential; choose a fresh SEED_REVIEW_*_EMAIL instead of reusing a Google-only account`,
      );
    }
    return existing[0];
  }

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers(),
  });
  if (!result.user?.id) {
    throw new Error(`Failed to create user ${email}`);
  }
  return result.user;
}

async function ensureSeedAdmin(adminPassword: string) {
  const adminEmail = resolveSeedAdminEmail(
    env.NODE_ENV,
    process.env.SEED_REVIEW_ADMIN_EMAIL,
  );
  if (isProductionLike(env.NODE_ENV)) {
    assertReviewAdminIsSeparate(adminEmail, env.ADMIN_EMAILS);
  }

  const admin = await ensureUser(adminEmail, adminPassword, "Admin User");
  await db
    .update(user)
    .set({ role: USER_ROLE.ADMIN, emailVerified: true })
    .where(eq(user.id, admin.id));
  console.log("Admin user ready:", admin.id);
  return admin;
}

async function seedSanityContent(adminId: string) {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  const expectedTarget = `${databaseUrl.hostname}:${databaseUrl.port || "5432"}${databaseUrl.pathname}`;
  const repoRoot = resolve(import.meta.dir, "../../../../");
  const importScript = resolve(repoRoot, "migration/sanity-content/import.ts");
  const importProcess = Bun.spawn(
    [
      process.execPath,
      importScript,
      "--manifest",
      "tmp/v3-content/20261024-123211/kb-calendar-prepared.json",
      "--mapping",
      "tmp/v3-content/20261024-123211/dev-category-mapping.json",
      "--assets",
      "tmp/v3-content/20261024-123211/assets",
      "--apply",
      "--seed-mode",
      "--expect-target",
      expectedTarget,
      "--actor",
      adminId,
    ],
    { cwd: repoRoot, stdout: "inherit", stderr: "inherit" },
  );
  const exitCode = await importProcess.exited;
  if (exitCode !== 0) {
    throw new Error(`Sanity content import failed with exit code ${exitCode}`);
  }
}

async function seedDemoStudent(
  email: string,
  password: string,
  name: string,
  initialMarks = 200,
) {
  const student = await ensureUser(email, password, name);
  await db
    .update(user)
    .set({ role: USER_ROLE.STUDENT, emailVerified: true })
    .where(eq(user.id, student.id));

  const { services } = await import("@cogito-app/api/services");
  const wallet = await services.wallet.getOrCreate(student.id);

  const existingCredit = await db.query.ledgerEntry.findFirst({
    where: (ledger, { eq: eqOp, and }) =>
      and(
        eqOp(ledger.walletId, wallet.id),
        eqOp(ledger.eventKey, "seed.demo_student_credit"),
      ),
  });

  if (!existingCredit && wallet.totalBalance < initialMarks) {
    await services.wallet.credit(db, {
      walletId: wallet.id,
      amount: initialMarks,
      eventKey: "seed.demo_student_credit",
      sourceReference: "seed",
      actorType: "system",
      reason: "Demo student starting balance",
    });
  }

  const finalWallet = await services.wallet.getByUserId(db, student.id);
  console.log(
    "Demo student ready:",
    student.id,
    "balance:",
    finalWallet?.totalBalance ?? 0,
  );
  return student;
}

async function ensureSeedAvailability(tutorId: string) {
  const slots = await db
    .select({
      id: availabilitySlot.id,
      startDate: availabilitySlot.startDate,
      endDate: availabilitySlot.endDate,
    })
    .from(availabilitySlot)
    .where(eq(availabilitySlot.tutorId, tutorId));

  const now = Date.now();
  const hasFutureBookableSlot = slots.some(
    (slot) =>
      slot.startDate.getTime() > now &&
      slot.endDate.getTime() - slot.startDate.getTime() >= 90 * 60_000,
  );

  if (!hasFutureBookableSlot) {
    const base = new Date();
    base.setHours(10, 0, 0, 0);
    for (let i = 1; i <= 5; i++) {
      const start = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      // eslint-disable-next-line no-await-in-loop
      await db.insert(availabilitySlot).values({
        tutorId,
        startDate: start,
        endDate: end,
        modality: "both",
      });
    }
  }

  // The booking flow uses a fixed 90-minute session. Repair legacy seed rows
  // that were created with one-hour windows so the deterministic demo account
  // always has at least one valid start time.
  for (const slot of slots) {
    if (
      slot.startDate.getTime() > now &&
      slot.endDate.getTime() - slot.startDate.getTime() < 90 * 60_000
    ) {
      // eslint-disable-next-line no-await-in-loop
      await db
        .update(availabilitySlot)
        .set({
          endDate: new Date(slot.startDate.getTime() + 2 * 60 * 60 * 1000),
        })
        .where(eq(availabilitySlot.id, slot.id));
    }
  }
}

async function ensureSeedTutorSubjects(profileId: string) {
  const existing = await db
    .select({ id: tutorProfileSubject.id })
    .from(tutorProfileSubject)
    .where(eq(tutorProfileSubject.tutorProfileId, profileId))
    .limit(1);
  if (existing[0]) return;

  const subjects = await db
    .select({ id: subjectCategory.id })
    .from(subjectCategory)
    .where(
      drizzleAnd(
        isNotNull(subjectCategory.parentId),
        eq(subjectCategory.isActive, true),
      ),
    )
    .orderBy(asc(subjectCategory.sortOrder), asc(subjectCategory.name))
    .limit(2);
  if (subjects.length === 0) {
    throw new Error(
      "Cannot seed the review tutor before the competition taxonomy is seeded",
    );
  }
  await db.insert(tutorProfileSubject).values(
    subjects.map((subject) => ({
      tutorProfileId: profileId,
      subjectId: subject.id,
    })),
  );
}

async function seedPresentationBooking(tutorId: string, studentId: string) {
  const existing = await db
    .select({
      id: booking.id,
      currentState: booking.currentState,
      priceSnapshot: booking.priceSnapshot,
      sessionId: bookingSession.id,
    })
    .from(booking)
    .leftJoin(bookingSession, eq(bookingSession.seriesBookingId, booking.id))
    .where(
      drizzleAnd(
        eq(booking.proposerId, studentId),
        eq(booking.type, "solo"),
        eq(booking.stateReason, "Presentation demo booking"),
      ),
    );

  const existingPresentation = existing.find((row) => row.sessionId);
  if (existingPresentation) {
    if (existingPresentation.priceSnapshot?.engine !== "v3") {
      throw new Error(
        "Reset the legacy presentation booking before running the V3 seed",
      );
    }
    if (existingPresentation.currentState === "scheduled") {
      const { services } = await import("@cogito-app/api/services");
      const wallet = await services.wallet.getByUserId(db, studentId);
      if (!wallet) throw new Error("Presentation student wallet not found");
      const holdEventKey = `seed.presentation_booking.${existingPresentation.id}.hold`;
      const existingHold = await db.query.ledgerEntry.findFirst({
        where: (ledger, { eq: eqOp, and }) =>
          and(
            eqOp(ledger.walletId, wallet.id),
            eqOp(ledger.eventKey, holdEventKey),
          ),
      });
      if (!existingHold) {
        await services.wallet.hold(db, {
          walletId: wallet.id,
          amount: existingPresentation.priceSnapshot.perStudentMarks,
          eventKey: holdEventKey,
          sourceReference: existingPresentation.id,
          bookingId: existingPresentation.id,
          actorType: "system",
          reason: "Presentation demo booking hold repair",
        });
      }
    }
    console.log(
      "Presentation booking already exists:",
      existingPresentation.id,
    );
    return existingPresentation.id;
  }

  const scheduledStartAt = new Date(Date.now() - 30 * 60 * 1000);
  const scheduledEndAt = new Date(scheduledStartAt.getTime() + 90 * 60 * 1000);
  const bookingId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const active = await getActiveV3Revision(db);
  if (!active)
    throw new Error("Seed active V3 pricing before the demo booking");
  const [subject] = await db
    .select({ category: subjectCategory })
    .from(tutorProfile)
    .innerJoin(
      tutorProfileSubject,
      eq(tutorProfileSubject.tutorProfileId, tutorProfile.id),
    )
    .innerJoin(
      subjectCategory,
      eq(subjectCategory.id, tutorProfileSubject.subjectId),
    )
    .where(
      drizzleAnd(
        eq(tutorProfile.userId, tutorId),
        eq(subjectCategory.isActive, true),
        isNotNull(subjectCategory.parentId),
      ),
    )
    .orderBy(asc(subjectCategory.sortOrder), asc(subjectCategory.name))
    .limit(1);
  if (!subject?.category.parentId)
    throw new Error("Seed tutor has no active specialization");
  const [parent] = await db
    .select()
    .from(subjectCategory)
    .where(
      drizzleAnd(
        eq(subjectCategory.id, subject.category.parentId),
        eq(subjectCategory.isActive, true),
      ),
    );
  if (!parent)
    throw new Error("Seed tutor specialization has no active parent");
  const quote = calculateV3SessionPrice(
    { competition: parent.slug, modality: "online", headcount: 1 },
    v3EconomyConfigSchema.parse(active.values),
  );
  const priceSnapshot = {
    engine: "v3" as const,
    v3Revision: active.version,
    competition: parent.slug,
    modality: "online" as const,
    headcount: 1,
    perStudentMarks: quote.perStudentMarks,
    collectedMarks: quote.collectedMarks,
    tutorHonorariumIdr: quote.tutorFeeIdr,
  };

  const { services } = await import("@cogito-app/api/services");
  await db.transaction(async (tx) => {
    const wallet = await services.wallet.getByUserId(tx, studentId);
    if (!wallet) throw new Error("Presentation student wallet not found");

    await tx.insert(booking).values({
      id: bookingId,
      type: "solo",
      modality: "online",
      tutorId,
      proposerId: studentId,
      targetGroupSize: 1,
      minConfirmedHeadcount: 1,
      confirmedHeadcount: 1,
      currentState: "scheduled",
      previousState: "confirmed",
      stateReason: "Presentation demo booking",
      scheduledStartAt,
      scheduledEndAt,
      timezone: "Asia/Jakarta",
      priceSnapshot,
      sessionTopic: {
        categoryId: parent.id,
        categorySlug: parent.slug,
        categoryName: parent.name,
        subcategoryId: subject.category.id,
        subcategorySlug: subject.category.slug,
        subcategoryName: subject.category.name,
      },
      originalMarks: quote.perStudentMarks,
      holdAmount: quote.perStudentMarks,
      learningGoal: "Presentation demo: complete a finished session",
    });

    await services.wallet.hold(tx, {
      walletId: wallet.id,
      amount: quote.perStudentMarks,
      eventKey: `seed.presentation_booking.${bookingId}.hold`,
      sourceReference: bookingId,
      bookingId,
      actorType: "system",
      reason: "Presentation demo booking hold",
    });

    await tx.insert(bookingParticipant).values([
      {
        id: crypto.randomUUID(),
        bookingId,
        userId: studentId,
        role: "proposer",
        confirmationState: "confirmed",
        heldAmount: quote.perStudentMarks,
        confirmedAt: new Date(),
        attendanceState: "unknown",
      },
      {
        id: crypto.randomUUID(),
        bookingId,
        userId: tutorId,
        role: "tutor",
        confirmationState: "confirmed",
        confirmedAt: new Date(),
        attendanceState: "unknown",
      },
    ]);

    await tx.insert(bookingSession).values({
      id: sessionId,
      seriesBookingId: bookingId,
      scheduledStartAt,
      scheduledEndAt,
      currentState: "scheduled",
      holdAmount: quote.perStudentMarks,
      priceSnapshot,
    });
  });

  console.log("Presentation booking ready:", bookingId, "session:", sessionId);
  return bookingId;
}

async function seedV3Economy(adminId: string) {
  await db.transaction(async (tx) => {
    await tx
      .insert(economyV3Activation)
      .values({ id: "default" })
      .onConflictDoNothing();
    const [activation] = await tx
      .select()
      .from(economyV3Activation)
      .where(eq(economyV3Activation.id, "default"))
      .for("update");
    if (activation?.activeRevision != null) {
      const active = await getActiveV3Revision(tx);
      if (!active) throw new Error("Active V3 pricing revision is missing");
      v3EconomyConfigSchema.parse(active.values);
      return;
    }
    const latest = await getLatestV3Revision(tx);
    const revision = await appendV3Revision(tx, {
      expectedVersion: latest?.version ?? 0,
      values: DEFAULT_V3_ECONOMY_CONFIG,
      reason: "Seed canonical Release V3 pricing defaults",
      createdBy: adminId,
    });
    if (!revision)
      throw new Error("V3 pricing changed while seeding; retry seed");
    await tx
      .update(economyV3Activation)
      .set({
        activeRevision: revision.version,
        updatedBy: adminId,
        updatedAt: new Date(),
      })
      .where(eq(economyV3Activation.id, "default"));
  });
}

export async function seed() {
  if (!seedAllowed(env.NODE_ENV, process.env.SEED_ALLOWED_IN_PROD)) {
    throw new Error(
      "Refusing to seed in production/staging unless SEED_ALLOWED_IN_PROD=true",
    );
  }
  const adminPassword = seedAdminPassword(process.env.SEED_ADMIN_PASSWORD);
  if (!adminPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD required (min 12 chars) in this environment",
    );
  }

  if (process.argv.includes("--sanity-content")) {
    const admin = await ensureSeedAdmin(adminPassword);
    await seedSanityContent(admin.id);
    return;
  }

  requireProductionReviewPassword(
    env.NODE_ENV,
    "SEED_TUTOR_PASSWORD",
    process.env.SEED_TUTOR_PASSWORD,
  );
  requireProductionReviewPassword(
    env.NODE_ENV,
    "SEED_STUDENT_PASSWORD",
    process.env.SEED_STUDENT_PASSWORD,
  );

  await seedPackages();
  await seedCompetitionTypes();

  const admin = await ensureSeedAdmin(adminPassword);
  await seedV3Economy(admin.id);

  const tutorEmail =
    process.env.SEED_REVIEW_TUTOR_EMAIL?.trim().toLowerCase() ||
    DEFAULT_SEED_TUTOR.email;
  const tutorPassword = demoPassword(
    process.env.SEED_TUTOR_PASSWORD,
    "tutor123",
  );
  const tutorUser = await ensureUser(
    tutorEmail,
    tutorPassword,
    DEFAULT_SEED_TUTOR.name,
  );
  await db
    .update(user)
    .set({ role: USER_ROLE.TUTOR, emailVerified: true })
    .where(eq(user.id, tutorUser.id));

  const existingProfile = await db
    .select()
    .from(tutorProfile)
    .where(eq(tutorProfile.userId, tutorUser.id))
    .limit(1);

  if (!existingProfile[0]) {
    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email: tutorEmail,
        displayName: DEFAULT_SEED_TUTOR.name,
        token: hashInviteToken(crypto.randomUUID()),
        status: "accepted",
        invitedBy: admin.id,
        expiresAt: new Date(
          Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ),
        acceptedBy: tutorUser.id,
        acceptedAt: new Date(),
      })
      .returning();

    const [profile] = await db
      .insert(tutorProfile)
      .values({
        userId: tutorUser.id,
        inviteId: invite!.id,
        shortBio:
          "Competition mentor for the Cogito verification environment. This profile contains review-only demonstration data.",
        affiliation: "Mathematics, Cogito Review University",
        education: [
          {
            university: "Cogito Review University",
            degree: "B.Sc. Mathematics",
          },
        ],
        achievements: [
          {
            competitionName: "National Mathematics Review Competition",
            year: 2025,
            awards: ["Gold Medal"],
          },
        ],
        experiences: [
          {
            role: "Competition Tutor",
            organization: "Cogito Academy Review Team",
            startYear: 2023,
            endYear: null,
            description:
              "Guides students through problem solving, practice sessions, and competition preparation.",
          },
        ],
        modality: "both",
        onboardingStatus: "published",
        publishedAt: new Date(),
      })
      .returning();

    await ensureSeedTutorSubjects(profile!.id);
    console.log("Seed tutor profile ready:", profile!.id);
  } else {
    await db
      .update(tutorProfile)
      .set({
        shortBio:
          "Competition mentor for the Cogito verification environment. This profile contains review-only demonstration data.",
        affiliation: "Mathematics, Cogito Review University",
        education: [
          {
            university: "Cogito Review University",
            degree: "B.Sc. Mathematics",
          },
        ],
        achievements: [
          {
            competitionName: "National Mathematics Review Competition",
            year: 2025,
            awards: ["Gold Medal"],
          },
        ],
        experiences: [
          {
            role: "Competition Tutor",
            organization: "Cogito Academy Review Team",
            startYear: 2023,
            endYear: null,
            description:
              "Guides students through problem solving, practice sessions, and competition preparation.",
          },
        ],
        modality: "both",
        onboardingStatus: "published",
        baseRatesIdr: null,
        prices: null,
        publishedAt: existingProfile[0].publishedAt ?? new Date(),
      })
      .where(eq(tutorProfile.userId, tutorUser.id));
    await ensureSeedTutorSubjects(existingProfile[0].id);
    console.log("Seed tutor profile already exists:", existingProfile[0].id);
  }

  await ensureSeedAvailability(tutorUser.id);

  const reviewStudent = await seedDemoStudent(
    process.env.SEED_REVIEW_STUDENT_EMAIL?.trim().toLowerCase() ||
      DEFAULT_SEED_STUDENTS[0].email,
    demoPassword(process.env.SEED_STUDENT_PASSWORD, "student123"),
    DEFAULT_SEED_STUDENTS[0].name,
    process.env.NODE_ENV === "test" &&
      process.env.T05_ENROLLMENT_TEST_DB_PORT === "6769"
      ? T05_E2E_STUDENT_INITIAL_MARKS
      : 200,
  );

  await seedPresentationBooking(tutorUser.id, reviewStudent.id);

  const friendPassword = demoPassword(
    process.env.SEED_STUDENT_PASSWORD,
    "student123",
  );

  await Promise.all([
    seedDemoStudent(
      DEFAULT_SEED_STUDENTS[1].email,
      friendPassword,
      DEFAULT_SEED_STUDENTS[1].name,
    ),
    seedDemoStudent(
      DEFAULT_SEED_STUDENTS[2].email,
      friendPassword,
      DEFAULT_SEED_STUDENTS[2].name,
    ),
  ]);

  const classEnrollmentStudentEmail =
    process.env.T05_CLASS_ENROLLMENT_STUDENT_EMAIL?.trim().toLowerCase();
  if (
    process.env.NODE_ENV === "test" &&
    process.env.T05_ENROLLMENT_TEST_DB_PORT === "6769" &&
    classEnrollmentStudentEmail
  ) {
    await seedDemoStudent(
      classEnrollmentStudentEmail,
      friendPassword,
      "Class Enrollment E2E",
      200,
    );
  }

  const classReportsStudentEmail =
    process.env.T07_CLASS_REPORTS_STUDENT_EMAIL?.trim().toLowerCase();
  if (
    process.env.NODE_ENV === "test" &&
    process.env.T05_ENROLLMENT_TEST_DB_PORT === "6769" &&
    classReportsStudentEmail
  ) {
    await seedDemoStudent(
      classReportsStudentEmail,
      friendPassword,
      "Class Reports E2E",
      200,
    );
  }
}

if (import.meta.main) {
  seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
