import type { DbType } from "../../lib/db";
import {
  ONBOARDING_STATUS,
  MODALITY,
  ACTOR_TYPE,
} from "../../shared/constants";
import type { TutorRepo, UpdateProfileInput } from "./tutor.repo";
import type { tutorProfile } from "@cogito-app/db/schema";
import type { TutorAuditPort, TutorPricingPort } from "./index";
import type { BookingPayoutPort } from "../booking";
import {
  TutorProfileNotFoundError,
  TutorProfileNotEditableError,
  InvalidTutorStatusError,
  AvailabilitySlotOverlapError,
  TutorProfileIncompleteError,
  InvalidTutorPricingError,
  OptimisticLockError,
  InvalidDateRangeError,
  WeeklyAvailabilityRangeError,
} from "./tutor.errors";

type TutorProfileRow = typeof tutorProfile.$inferSelect;

/**
 * Validates tutor profile update input against status and pricing constraints.
 *
 * @param profile - the existing tutor profile (undefined means not found)
 * @param input - the update input to validate
 * @param pricingPort - the pricing port used to validate prices
 * @throws {TutorProfileNotFoundError} if the profile does not exist
 * @throws {TutorProfileNotEditableError} if the profile is published
 * @throws {InvalidTutorPricingError} if prices violate the Cogito floor
 */
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

/**
 * Validates a tutor profile for submission to review (draft/changes_requested, required fields, pricing).
 *
 * @param profile - the existing tutor profile (undefined means not found)
 * @param pricingPort - the pricing port used to validate prices
 * @throws {TutorProfileNotFoundError} if the profile does not exist
 * @throws {InvalidTutorStatusError} if the profile is not in a submittable state
 * @throws {TutorProfileIncompleteError} if required fields are missing
 * @throws {InvalidTutorPricingError} if prices violate the Cogito floor
 */
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

/**
 * Creates the tutor service for profile and availability management.
 *
 * @param deps - the dependency ports (tutorRepo, pricingPort, auditPort, db)
 * @returns a TutorService with profile and availability methods
 */
export function createTutorService(deps: {
  tutorRepo: TutorRepo;
  pricingPort: TutorPricingPort;
  auditPort: TutorAuditPort;
  db: DbType;
  payout: BookingPayoutPort;
}) {
  const { tutorRepo, pricingPort, auditPort, db, payout } = deps;

  /**
   * Fetches the tutor profile for the requesting user.
   *
   * @param userId - the tutor user
   * @returns the tutor profile
   * @throws {TutorProfileNotFoundError} if the profile does not exist
   */
  async function getMyProfile(userId: string) {
    const profile = await tutorRepo.getByUserId(db, userId);
    if (!profile) throw new TutorProfileNotFoundError(userId);
    return profile;
  }

  /**
   * Updates the tutor profile with optimistic concurrency via version.
   *
   * @param userId - the tutor user
   * @param input - the update input including the expected version
   * @returns the updated tutor profile
   * @throws {OptimisticLockError} if the version does not match
   */
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

  /**
   * Submits the tutor profile for admin review, recording an audit entry.
   *
   * @param userId - the tutor user
   * @returns the updated tutor profile
   * @throws {TutorProfileNotFoundError} if the profile does not exist
   */
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

  /**
   * Lists the tutor's future availability slots.
   *
   * @param userId - the tutor user
   * @returns the active future availability slots
   */
  async function listAvailability(userId: string) {
    return tutorRepo.listAvailability(db, userId, { from: new Date() });
  }

  /**
   * Creates or updates an availability slot, rejecting overlaps.
   *
   * @param userId - the tutor user
   * @param input - the slot details (id when updating an existing slot)
   * @returns the created or updated slot
   * @throws {AvailabilitySlotOverlapError} if the slot overlaps an existing one
   */
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
  /**
   * Deactivates an availability slot (soft delete) if it belongs to the tutor.
   *
   * @param userId - the tutor user
   * @param slotId - the slot to deactivate
   * @throws {TutorProfileNotFoundError} if the slot does not exist
   */
  async function deleteAvailability(userId: string, slotId: string) {
    const slots = await tutorRepo.listAvailability(db, userId, {
      from: new Date(),
    });
    const found = slots.find((s) => s.id === slotId);
    if (!found) throw new TutorProfileNotFoundError(userId);
    await tutorRepo.deleteAvailability(db, slotId);
  }

  async function getMyPayouts(
    userId: string,
    input: { dateFrom?: string; dateTo?: string },
  ) {
    if (input.dateFrom && Number.isNaN(Date.parse(input.dateFrom))) {
      throw new InvalidDateRangeError("dateFrom");
    }
    if (input.dateTo && Number.isNaN(Date.parse(input.dateTo))) {
      throw new InvalidDateRangeError("dateTo");
    }
    return payout.getTutorPayouts({
      tutorId: userId,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
    });
  }

  return {
    getMyProfile,
    updateMyProfile,
    submitForReview,
    listAvailability,
    upsertAvailability,
    createWeeklyAvailability,
    deleteAvailability,
    getMyPayouts,
  };
}

export type TutorService = ReturnType<typeof createTutorService>;
