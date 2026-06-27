import { eq } from "drizzle-orm";

import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import {
  user,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
} from "@cogito-app/db/schema";

const SEED_SUFFIX = "seed";
const SEED_DISPLAY_TAG = "[seed]";

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

async function seed() {
  const adminEmail = "admin@cogitoacademy.id";

  const admin = await ensureUser(adminEmail, "admin123", "Admin User");
  await db.update(user).set({ role: "admin" }).where(eq(user.id, admin.id));
  console.log("Admin user ready:", admin.id);

  const tutorEmail = `tutor.${SEED_SUFFIX}@cogitoacademy.id`;
  const tutorUser = await ensureUser(
    tutorEmail,
    "tutor123",
    `${SEED_DISPLAY_TAG} Tutor`,
  );
  await db.update(user).set({ role: "tutor" }).where(eq(user.id, tutorUser.id));

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
        token: crypto.randomUUID(),
        status: "accepted",
        invitedBy: admin.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
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
        prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
        availabilitySummary: "Weekdays 16:00–20:00 WIB",
        onboardingStatus: "published",
        publishedAt: new Date(),
      })
      .returning();

    const base = new Date();
    base.setHours(10, 0, 0, 0);
    for (let i = 1; i <= 5; i++) {
      const start = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await db.insert(availabilitySlot).values({
        tutorId: tutorUser.id,
        startDate: start,
        endDate: end,
        modality: "both",
      });
    }

    console.log("Seed tutor profile ready:", profile!.id);
  } else {
    console.log("Seed tutor profile already exists:", existingProfile[0].id);
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
