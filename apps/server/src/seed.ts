import { eq } from "drizzle-orm";

import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { env } from "@cogito-app/env/server";
import { isProductionLike } from "@cogito-app/env/node-env";
import {
  user,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  markPackage,
  economyConfig,
} from "@cogito-app/db/schema";
import {
  INVITE_EXPIRY_DAYS,
  USER_ROLE,
} from "@cogito-app/api/shared/constants";
import { DEFAULT_ECONOMY_CONFIG } from "@cogito-app/api/modules/economy/economy.types";
import { hashInviteToken } from "@cogito-app/api/lib/tokens";
import {
  DEFAULT_PRODUCTION_ADMIN_EMAIL,
  parseConfiguredAdminEmails,
} from "@cogito-app/env/admin";

const SEED_SUFFIX = "seed";
const SEED_DISPLAY_TAG = "[seed]";

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
  configuredEmails?: string,
): string {
  if (!isProductionLike(nodeEnv)) return "admin@cogitoacademy.id";

  return (
    parseConfiguredAdminEmails(configuredEmails)[0] ??
    DEFAULT_PRODUCTION_ADMIN_EMAIL
  );
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

const PACKAGES = [
  { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 312500 },
  { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 690000 },
  { code: "explorer", name: "Explorer Pack", marks: 200, priceIdr: 1070000 },
  { code: "pioneer", name: "Pioneer Pack", marks: 400, priceIdr: 2000000 },
];

async function ensureUser(email: string, password: string, name: string) {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing[0]) return existing[0];

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers(),
  });
  if (!result.user?.id) {
    throw new Error(`Failed to create user ${email}`);
  }
  return result.user;
}

async function seedPackages() {
  await Promise.all(
    PACKAGES.map((pkg) =>
      db.insert(markPackage).values(pkg).onConflictDoNothing({
        target: markPackage.code,
      }),
    ),
  );
  console.log("Seeded mark packages");
}

async function seedDemoStudent(email: string, password: string, name: string) {
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

  if (!existingCredit && wallet.totalBalance < 200) {
    await services.wallet.credit(db, {
      walletId: wallet.id,
      amount: 200,
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

  if (slots.length === 0) {
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
    return;
  }

  // The booking flow uses a fixed 90-minute session. Repair legacy seed rows
  // that were created with one-hour windows so the deterministic demo account
  // always has at least one valid start time.
  for (const slot of slots) {
    if (slot.endDate.getTime() - slot.startDate.getTime() < 90 * 60_000) {
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

async function resetTestEconomy() {
  if (env.NODE_ENV !== "test") return;

  await db
    .insert(economyConfig)
    .values(DEFAULT_ECONOMY_CONFIG)
    .onConflictDoUpdate({
      target: economyConfig.id,
      set: {
        markValueIdr: DEFAULT_ECONOMY_CONFIG.markValueIdr,
        minTutorBaseRateIdr: DEFAULT_ECONOMY_CONFIG.minTutorBaseRateIdr,
        onlineTutorIncrementIdr: DEFAULT_ECONOMY_CONFIG.onlineTutorIncrementIdr,
        offlineTutorIncrementIdr:
          DEFAULT_ECONOMY_CONFIG.offlineTutorIncrementIdr,
        onlineCogitoBaseIdr: DEFAULT_ECONOMY_CONFIG.onlineCogitoBaseIdr,
        onlineCogitoIncrementIdr:
          DEFAULT_ECONOMY_CONFIG.onlineCogitoIncrementIdr,
        offlineCogitoBaseIdr: DEFAULT_ECONOMY_CONFIG.offlineCogitoBaseIdr,
        offlineCogitoIncrementIdr:
          DEFAULT_ECONOMY_CONFIG.offlineCogitoIncrementIdr,
        version: DEFAULT_ECONOMY_CONFIG.version,
        updatedBy: null,
      },
    });
}

async function seed() {
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

  await resetTestEconomy();
  await seedPackages();

  const adminEmail = resolveSeedAdminEmail(env.NODE_ENV, env.ADMIN_EMAILS);

  const admin = await ensureUser(adminEmail, adminPassword, "Admin User");
  await db
    .update(user)
    .set({ role: USER_ROLE.ADMIN, emailVerified: true })
    .where(eq(user.id, admin.id));
  console.log("Admin user ready:", admin.id);

  const tutorEmail = `tutor.${SEED_SUFFIX}@cogitoacademy.id`;
  const tutorPassword = demoPassword(
    process.env.SEED_TUTOR_PASSWORD,
    "tutor123",
  );
  const tutorUser = await ensureUser(
    tutorEmail,
    tutorPassword,
    `${SEED_DISPLAY_TAG} Tutor`,
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
        displayName: `${SEED_DISPLAY_TAG} Tutor`,
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
        displayName: `${SEED_DISPLAY_TAG} Tutor`,
        shortBio: "Seed tutor for local development",
        credentialsSummary: "Seed credentials",
        expertise: ["Mathematics", "Physics"],
        modality: "both",
        baseRatesIdr: { online: 175_000, offline: 225_000 },
        prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
        availabilitySummary: "Weekdays 16:00–20:00 WIB",
        onboardingStatus: "published",
        publishedAt: new Date(),
      })
      .returning();

    console.log("Seed tutor profile ready:", profile!.id);
  } else {
    await db
      .update(tutorProfile)
      .set({ baseRatesIdr: { online: 175_000, offline: 225_000 } })
      .where(eq(tutorProfile.userId, tutorUser.id));
    console.log("Seed tutor profile already exists:", existingProfile[0].id);
  }

  await ensureSeedAvailability(tutorUser.id);

  await seedDemoStudent(
    `student.${SEED_SUFFIX}@cogitoacademy.id`,
    demoPassword(process.env.SEED_STUDENT_PASSWORD, "student123"),
    `${SEED_DISPLAY_TAG} Student`,
  );

  const friendPassword = demoPassword(
    process.env.SEED_STUDENT_PASSWORD,
    "student123",
  );

  await Promise.all([
    seedDemoStudent(
      `student.friend1.${SEED_SUFFIX}@cogitoacademy.id`,
      friendPassword,
      `${SEED_DISPLAY_TAG} Alya Friend`,
    ),
    seedDemoStudent(
      `student.friend2.${SEED_SUFFIX}@cogitoacademy.id`,
      friendPassword,
      `${SEED_DISPLAY_TAG} Bima Friend`,
    ),
    seedDemoStudent(
      `student.friend3.${SEED_SUFFIX}@cogitoacademy.id`,
      friendPassword,
      `${SEED_DISPLAY_TAG} Citra Friend`,
    ),
  ]);
}

if (import.meta.main) {
  seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
