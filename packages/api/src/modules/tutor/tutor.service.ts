import type { DbType } from "../../lib/db";
import { notFound, badRequest, forbidden } from "../../lib/errors";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  GroupSize,
  Modality,
  PriceSnapshot,
} from "../pricing/pricing.service";
import {
  ONBOARDING_STATUS,
  MODALITY,
  ACTOR_TYPE,
} from "../../shared/constants";
import type { TutorRepo, UpdateProfileInput } from "./tutor.repo";
import type { tutorProfile } from "@cogito-app/db/schema";
import type { ORPCError } from "@orpc/server";

type TutorProfileRow = typeof tutorProfile.$inferSelect;

interface TutorAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

interface TutorPricingPort {
  validatePrices(
    prices: Record<string, number>,
    modality: Modality,
  ): string | null;
  computeSplit(totalMarks: number, groupSize: GroupSize): PriceSnapshot;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: ORPCError<any, any> };

export function validateUpdateInput(
  profile: TutorProfileRow | undefined,
  input: UpdateProfileInput,
  pricingPort: TutorPricingPort,
): ValidationResult {
  if (!profile) {
    return { ok: false, error: notFound("Tutor profile not found") };
  }

  if (profile.onboardingStatus === ONBOARDING_STATUS.PUBLISHED) {
    return {
      ok: false,
      error: forbidden(
        "Published profiles cannot be edited directly. Contact admin.",
      ),
    };
  }

  if (input.prices) {
    const modality = (input.modality ?? profile.modality ?? MODALITY.ONLINE) as
      | "online"
      | "offline"
      | "both";
    const error = pricingPort.validatePrices(input.prices, modality);
    if (error) {
      return { ok: false, error: badRequest(error) };
    }
  }

  return { ok: true };
}

export function validateSubmitForReview(
  profile: TutorProfileRow | undefined,
  pricingPort: TutorPricingPort,
): ValidationResult {
  if (!profile) {
    return { ok: false, error: notFound("Tutor profile not found") };
  }

  if (
    profile.onboardingStatus !== ONBOARDING_STATUS.DRAFT &&
    profile.onboardingStatus !== ONBOARDING_STATUS.CHANGES_REQUESTED
  ) {
    return {
      ok: false,
      error: badRequest(
        `Cannot submit from status: ${profile.onboardingStatus}`,
      ),
    };
  }

  const requiredFields = [
    profile.displayName,
    profile.shortBio,
    profile.credentialsSummary,
    profile.modality,
    profile.prices,
  ];
  if (requiredFields.some((f) => !f)) {
    return {
      ok: false,
      error: badRequest("All required fields must be filled before submission"),
    };
  }

  if (!profile.expertise || profile.expertise.length === 0) {
    return {
      ok: false,
      error: badRequest("At least one expertise track is required"),
    };
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
      return { ok: false, error: badRequest(error) };
    }
  }

  return { ok: true };
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
      startDate: string | Date;
      endDate: string | Date;
      modality: "online" | "offline" | "both";
      isRecurring?: boolean;
      recurrenceRule?: string;
      isActive?: boolean;
    },
  ) {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);

    if (end <= start) {
      throw badRequest("endDate must be after startDate");
    }

    const existing = await tutorRepo.listAvailability(db, userId);
    const overlapping = existing.find((slot) => {
      if (input.id && slot.id === input.id) return false;
      return start < slot.endDate && end > slot.startDate;
    });
    if (overlapping) {
      throw badRequest("Availability window overlaps with an existing slot");
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
    if (!found)
      throw forbidden("You can only delete your own availability slots");
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
