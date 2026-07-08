import type { DbType } from "../../lib/db";
import { notFound } from "../../lib/errors";
import type { AuditPort } from "../../shared/ports/audit.port";
import type { PricingPort } from "../../shared/ports/pricing.port";
import type { TutorRepo, UpdateProfileInput } from "./tutor.repo";
import { validateUpdateInput, validateSubmitForReview } from "./tutor.service";

export function createTutorHandler(deps: {
  tutorRepo: TutorRepo;
  pricingPort: PricingPort;
  auditPort: AuditPort;
  db: DbType;
}) {
  const { tutorRepo, pricingPort, auditPort, db } = deps;

  async function getMyProfile(userId: string) {
    const profile = await tutorRepo.getByUserId(db, userId);
    if (!profile) throw notFound("Tutor profile not found");
    return profile;
  }

  async function updateMyProfile(userId: string, input: UpdateProfileInput) {
    const profile = await tutorRepo.getByUserId(db, userId);
    const result = validateUpdateInput(profile, input, pricingPort);
    if (!result.ok) throw result.error;
    return tutorRepo.updateProfile(db, userId, input);
  }

  async function submitForReview(userId: string) {
    const profile = await tutorRepo.getByUserId(db, userId);
    const result = validateSubmitForReview(profile, pricingPort);
    if (!result.ok) throw result.error;

    return db.transaction(async (tx) => {
      const row = await tutorRepo.updateStatus(tx, userId, "pending_review");

      await auditPort.record({
        db: tx,
        actorId: userId,
        actorType: "tutor",
        action: "tutor_profile_submitted_for_review",
        targetId: profile!.id,
        targetType: "tutor_profile",
        beforeState: { onboardingStatus: profile!.onboardingStatus },
        afterState: { onboardingStatus: "pending_review" },
      });

      return row;
    });
  }

  async function listAvailability(userId: string) {
    return tutorRepo.listAvailability(db, userId);
  }

  async function upsertAvailability(
    userId: string,
    input: {
      id?: string;
      startDate: string | Date;
      endDate: string | Date;
      modality: "online" | "offline" | "both";
      isRecurring?: boolean;
      recurrenceRule?: string;
      isActive?: boolean;
    },
  ) {
    return tutorRepo.upsertAvailability(db, userId, {
      ...input,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
    });
  }

  async function deleteAvailability(_userId: string, slotId: string) {
    await tutorRepo.deleteAvailability(db, slotId);
  }

  return {
    getMyProfile,
    updateMyProfile,
    submitForReview,
    listAvailability,
    upsertAvailability,
    deleteAvailability,
  };
}

export type TutorHandler = ReturnType<typeof createTutorHandler>;
