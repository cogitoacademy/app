import type { DbType } from "../../lib/db";
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
  WeeklyAvailabilityRangeError,
  TutorProfileIncompleteError,
  InvalidTutorPricingError,
  OptimisticLockError,
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
      throw new InvalidTutorPricingError(profile.id, error);
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

  const requiredFields: { key: string; value: unknown }[] = [
    { key: "displayName", value: profile.displayName },
    { key: "shortBio", value: profile.shortBio },
    { key: "credentialsSummary", value: profile.credentialsSummary },
    { key: "modality", value: profile.modality },
    { key: "prices", value: profile.prices },
  ];
  const missingFields = requiredFields
    .filter((f) => !f.value)
    .map((f) => f.key);
  if (missingFields.length > 0) {
    throw new TutorProfileIncompleteError(profile.id, missingFields);
  }

  if (!profile.expertise || profile.expertise.length === 0) {
    throw new TutorProfileIncompleteError(profile.id, ["expertise"]);
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
      throw new InvalidTutorPricingError(profile.id, error);
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
    const { version, ...data } = input;
    const rows = await tutorRepo.updateProfileWithVersion(
      db,
      userId,
      version,
      data,
    );
    if (rows.length === 0) throw new OptimisticLockError(profile!.id, version);
    return rows[0];
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
    return tutorRepo.listAvailability(db, userId, { from: new Date() });
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

    const existing = await tutorRepo.listAvailability(db, userId, {
      from: new Date(),
    });
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

  async function createWeeklyAvailability(
    userId: string,
    input: {
      startDate: Date;
      endDate: Date;
      repeatUntil: Date;
      modality: "online" | "offline" | "both";
    },
  ) {
    const durationMs = input.endDate.getTime() - input.startDate.getTime();
    const occurrences: Array<{ startDate: Date; endDate: Date }> = [];

    for (
      let startDate = new Date(input.startDate);
      startDate <= input.repeatUntil;
      startDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    ) {
      occurrences.push({
        startDate,
        endDate: new Date(startDate.getTime() + durationMs),
      });
    }

    if (occurrences.length === 0 || occurrences.length > 53) {
      throw new WeeklyAvailabilityRangeError();
    }

    return db.transaction(async (tx) => {
      const existing = await tutorRepo.listAvailability(tx, userId);
      const overlaps = occurrences.some((occurrence, occurrenceIndex) => {
        const overlapsExisting = existing.some(
          (slot) =>
            occurrence.startDate < slot.endDate &&
            occurrence.endDate > slot.startDate,
        );
        const overlapsEarlierOccurrence = occurrences
          .slice(0, occurrenceIndex)
          .some(
            (earlier) =>
              occurrence.startDate < earlier.endDate &&
              occurrence.endDate > earlier.startDate,
          );
        return overlapsExisting || overlapsEarlierOccurrence;
      });

      if (overlaps) throw new AvailabilitySlotOverlapError(userId);

      return Promise.all(
        occurrences.map((occurrence) =>
          tutorRepo.upsertAvailability(tx, userId, {
            ...occurrence,
            modality: input.modality,
            isRecurring: true,
            recurrenceRule: "weekly",
            isActive: true,
          }),
        ),
      );
    });
  }

  async function deleteAvailability(userId: string, slotId: string) {
    const slots = await tutorRepo.listAvailability(db, userId, {
      from: new Date(),
    });
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
    createWeeklyAvailability,
    deleteAvailability,
  };
}

export type TutorService = ReturnType<typeof createTutorService>;
