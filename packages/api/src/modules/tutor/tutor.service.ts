import type { DbType } from "../../lib/db";
import { badRequest } from "../../lib/errors";
import {
  ONBOARDING_STATUS,
  MODALITY,
  ACTOR_TYPE,
} from "../../shared/constants";
import type { TutorRepo, UpdateProfileInput } from "./tutor.repo";
import type { tutorProfile } from "@cogito-app/db/schema";
import type { TutorAuditPort, TutorPricingPort } from "./index";
import {
  TutorProfileNotFoundError,
  TutorProfileNotEditableError,
  InvalidTutorStatusError,
  AvailabilitySlotOverlapError,
} from "./tutor.errors";

type TutorProfileRow = typeof tutorProfile.$inferSelect;

export function validateUpdateInput(
  profile: TutorProfileRow | undefined,
  input: UpdateProfileInput,
  pricingPort: TutorPricingPort,
): void {
  if (!profile) {
    throw new TutorProfileNotFoundError("unknown");
  }

  if (profile.onboardingStatus === ONBOARDING_STATUS.PUBLISHED) {
    throw new TutorProfileNotEditableError(
      profile.id,
      profile.onboardingStatus,
    );
  }

  if (input.prices) {
    const modality = (input.modality ?? profile.modality ?? MODALITY.ONLINE) as
      | "online"
      | "offline"
      | "both";
    const error = pricingPort.validatePrices(input.prices, modality);
    if (error) {
      throw badRequest(error);
    }
  }
}

export function validateSubmitForReview(
  profile: TutorProfileRow | undefined,
  pricingPort: TutorPricingPort,
): void {
  if (!profile) {
    throw new TutorProfileNotFoundError("unknown");
  }

  if (
    profile.onboardingStatus !== ONBOARDING_STATUS.DRAFT &&
    profile.onboardingStatus !== ONBOARDING_STATUS.CHANGES_REQUESTED
  ) {
    throw new InvalidTutorStatusError(profile.id, profile.onboardingStatus);
  }

  const requiredFields = [
    profile.displayName,
    profile.shortBio,
    profile.credentialsSummary,
    profile.modality,
    profile.prices,
  ];
  if (requiredFields.some((f) => !f)) {
    throw badRequest("All required fields must be filled before submission");
  }

  if (!profile.expertise || profile.expertise.length === 0) {
    throw badRequest("At least one expertise track is required");
  }

  if (profile.prices) {
    const modality = (profile.modality ?? MODALITY.ONLINE) as
      | "online"
      | "offline"
      | "both";
    const error = pricingPort.validatePrices(
      profile.prices as Record<string, number>,
      modality,
    );
    if (error) {
      throw badRequest(error);
    }
  }
}

export function createTutorService(deps: {
  tutorRepo: TutorRepo;
  pricingPort: TutorPricingPort;
  auditPort: TutorAuditPort;
  db: DbType;
}) {
  const { tutorRepo, pricingPort, auditPort, db } = deps;

  async function getMyProfile(userId: string) {
    const profile = await tutorRepo.getByUserId(db, userId);
    if (!profile) throw new TutorProfileNotFoundError(userId);
    return profile;
  }

  async function updateMyProfile(userId: string, input: UpdateProfileInput) {
    const profile = await tutorRepo.getByUserId(db, userId);
    validateUpdateInput(profile, input, pricingPort);
    return tutorRepo.updateProfile(db, userId, input);
  }

  async function submitForReview(userId: string) {
    const profile = await tutorRepo.getByUserId(db, userId);
    validateSubmitForReview(profile, pricingPort);

    return db.transaction(async (tx) => {
      const row = await tutorRepo.updateStatus(
        tx,
        userId,
        ONBOARDING_STATUS.PENDING_REVIEW,
      );

      await auditPort.record({
        db: tx,
        actorId: userId,
        actorType: ACTOR_TYPE.TUTOR,
        action: "tutor_profile_submitted_for_review",
        targetId: profile!.id,
        targetType: "tutor_profile",
        beforeState: { onboardingStatus: profile!.onboardingStatus },
        afterState: { onboardingStatus: ONBOARDING_STATUS.PENDING_REVIEW },
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
      startDate: Date;
      endDate: Date;
      modality: "online" | "offline" | "both";
      isRecurring?: boolean;
      recurrenceRule?: string;
      isActive?: boolean;
    },
  ) {
    const start = input.startDate;
    const end = input.endDate;

    const existing = await tutorRepo.listAvailability(db, userId);
    const overlapping = existing.find((slot) => {
      if (input.id && slot.id === input.id) return false;
      return start < slot.endDate && end > slot.startDate;
    });
    if (overlapping) {
      throw new AvailabilitySlotOverlapError(userId);
    }

    return tutorRepo.upsertAvailability(db, userId, {
      ...input,
      startDate: start,
      endDate: end,
    });
  }

  async function deleteAvailability(userId: string, slotId: string) {
    const slots = await tutorRepo.listAvailability(db, userId);
    const found = slots.find((s) => s.id === slotId);
    if (!found) throw new TutorProfileNotFoundError(userId);
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

export type TutorService = ReturnType<typeof createTutorService>;
