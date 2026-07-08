import { db } from "../../lib/db";
import { notFound } from "../../lib/errors";
import type { WalletPort } from "../../shared/ports/wallet.port";
import { validateUpdateInput, type UpdateProfileInput } from "./auth.service";
import type { AuthRepo, StudentProfileRow, TutorProfileRow } from "./auth.repo";

export interface MeResult {
  profile: StudentProfileRow | null;
  tutorProfile: TutorProfileRow | null;
  wallet: {
    id: string;
    totalBalance: number;
    heldBalance: number;
    availableBalance: number;
  };
}

export type AuthHandler = ReturnType<typeof createAuthHandler>;

export function createAuthHandler(deps: {
  authRepo: AuthRepo;
  walletPort: WalletPort;
}) {
  const { authRepo, walletPort } = deps;

  async function me(userId: string): Promise<MeResult> {
    const [profile, tutorProfile, walletSnapshot] = await Promise.all([
      authRepo.getStudentProfile(db, userId),
      authRepo.getTutorProfile(db, userId),
      walletPort.getOrCreate(userId),
    ]);

    return {
      profile: profile ?? null,
      tutorProfile: tutorProfile ?? null,
      wallet: {
        id: walletSnapshot.id,
        totalBalance: walletSnapshot.totalBalance,
        heldBalance: walletSnapshot.heldBalance,
        availableBalance: walletSnapshot.availableBalance,
      },
    };
  }

  async function getProfile(userId: string): Promise<StudentProfileRow> {
    const profile = await authRepo.getStudentProfile(db, userId);
    if (!profile) throw notFound("Profile not found");
    return profile;
  }

  async function updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<StudentProfileRow> {
    const result = validateUpdateInput(input);
    if (!result.ok) throw result.error;

    const existing = await authRepo.getStudentProfile(db, userId);
    if (existing) return authRepo.upsertProfile(db, userId, input);
    return authRepo.createProfile(db, userId, input);
  }

  return { me, getProfile, updateProfile };
}
