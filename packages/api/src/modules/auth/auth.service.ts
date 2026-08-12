import type { z } from "zod";
import type { DbType } from "../../lib/db";
import { ProfileNotFoundError } from "./auth.errors";
import type { AuthRepo, StudentProfileRow, TutorProfileRow } from "./auth.repo";
import { updateProfileInput } from "./auth.types";
import type { AuthWalletPort } from "./index";

export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

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

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(deps: {
  authRepo: AuthRepo;
  walletPort: AuthWalletPort;
  db: DbType;
}) {
  const { authRepo, walletPort, db } = deps;

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
    if (!profile) throw new ProfileNotFoundError(userId);
    return profile;
  }

  async function updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<StudentProfileRow> {
    const existing = await authRepo.getStudentProfile(db, userId);
    if (existing) return authRepo.upsertProfile(db, userId, input);
    return authRepo.createProfile(db, userId, input);
  }

  async function searchStudents(
    requesterId: string,
    query: string,
    limit: number,
  ) {
    return authRepo.searchStudents(db, query.trim(), requesterId, limit);
  }

  return { me, getProfile, updateProfile, searchStudents };
}
