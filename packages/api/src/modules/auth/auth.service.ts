import { eq } from "drizzle-orm";
import { studentProfile, tutorProfile } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { WalletPort } from "../../shared/ports/wallet.port";
import { notFound } from "../../lib/errors";

export interface MeResult {
  profile: typeof studentProfile.$inferSelect | null;
  tutorProfile: typeof tutorProfile.$inferSelect | null;
  wallet: {
    id: string;
    totalBalance: number;
    heldBalance: number;
    availableBalance: number;
  };
}

export interface UpdateProfileInput {
  phoneNumber?: string;
  schoolName?: string;
  gradeLevel?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
}

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(deps: { db: DbType; wallet: WalletPort }) {
  const { db, wallet } = deps;

  async function me(userId: string): Promise<MeResult> {
    const [profile, tutor, walletSnapshot] = await Promise.all([
      db.query.studentProfile.findFirst({
        where: eq(studentProfile.userId, userId),
      }),
      db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      }),
      wallet.getOrCreate(userId),
    ]);

    return {
      profile: profile ?? null,
      tutorProfile: tutor ?? null,
      wallet: {
        id: walletSnapshot.id,
        totalBalance: walletSnapshot.totalBalance,
        heldBalance: walletSnapshot.heldBalance,
        availableBalance: walletSnapshot.availableBalance,
      },
    };
  }

  async function getProfile(userId: string) {
    const profile = await db.query.studentProfile.findFirst({
      where: eq(studentProfile.userId, userId),
    });
    if (!profile) throw notFound("Profile not found");
    return profile;
  }

  async function updateProfile(userId: string, input: UpdateProfileInput) {
    const existing = await db.query.studentProfile.findFirst({
      where: eq(studentProfile.userId, userId),
    });

    if (existing) {
      const [updated] = await db
        .update(studentProfile)
        .set(input)
        .where(eq(studentProfile.userId, userId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(studentProfile)
      .values({ userId, ...input })
      .returning();
    return created;
  }

  return { me, getProfile, updateProfile };
}
