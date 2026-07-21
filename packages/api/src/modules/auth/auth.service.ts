import type { z } from "zod";
import { ORPCError } from "@orpc/server";
import type { DbType } from "../../lib/db";
import { notFound } from "../../lib/errors";
import type { WalletPort } from "../../shared/ports/wallet.port";
import type { AuthRepo, StudentProfileRow, TutorProfileRow } from "./auth.repo";
import { updateProfileInput } from "./auth.types";

export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

type AuthError = ORPCError<"BAD_REQUEST", undefined>;

export type ValidationResult = { ok: true } | { ok: false; error: AuthError };

export function validateUpdateInput(
  input: UpdateProfileInput,
): ValidationResult {
  const stringFields = [
    "phoneNumber",
    "schoolName",
    "gradeLevel",
    "parentName",
    "parentPhone",
    "parentEmail",
  ] as const;

  for (const field of stringFields) {
    const value = input[field];
    if (value !== undefined && value.trim() === "") {
      return {
        ok: false,
        error: new ORPCError("BAD_REQUEST", {
          message: `${field} cannot be blank`,
        }),
      };
    }
  }

  return { ok: true };
}

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
  walletPort: WalletPort;
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
