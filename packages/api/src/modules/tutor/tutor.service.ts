import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { lockTutorForBooking } from "../../lib/locks";
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
  haveSameSubjectIds,
  toNormalizedTutorSubjects,
  type TutorSubjectRelation,
  validateTutorSubjectIds,
} from "../tutor-subjects/subject-selection";
import {
  TutorProfileNotFoundError,
  InvalidTutorStatusError,
  AvailabilitySlotOverlapError,
  TutorProfileIncompleteError,
  InvalidTutorPricingError,
  OptimisticLockError,
  InvalidDateRangeError,
  WeeklyAvailabilityRangeError,
} from "./tutor.errors";

type TutorProfileRow = typeof tutorProfile.$inferSelect;
type TutorProfileWithSubjectRelations = TutorProfileRow & {
  subjects?: Array<TutorSubjectRelation & { subjectId: string }>;
};

function getSubjectRelations(profile: unknown) {
  const subjects = (profile as TutorProfileWithSubjectRelations | undefined)
    ?.subjects;
  return subjects ?? [];
}

function projectTutorProfile(profile: unknown) {
  if (!profile) return profile;
  return {
    ...(profile as Record<string, unknown>),
    subjects: toNormalizedTutorSubjects(
      getSubjectRelations(profile),
    ),
  };
}

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Validates tutor profile update input against status and pricing constraints.
 *
 * @param profile - the existing tutor profile (undefined means not found)
 * @param input - the update input to validate
 * @param pricingPort - the pricing port used to validate prices
 * @throws {TutorProfileNotFoundError} if the profile does not exist
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

  const selectedSubjects = (profile as TutorProfileWithSubjectRelations).subjects;
  if (!selectedSubjects || selectedSubjects.length === 0) {
    throw new TutorProfileIncompleteError(profile.id, ["subjectIds"]);
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
    return projectTutorProfile(profile);
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
    const { version, subjectIds, ...data } = input;
    if (subjectIds !== undefined) {
      const activeChildSubjects = await tutorRepo.listActiveChildSubjects(
        db,
        subjectIds,
      );
      validateTutorSubjectIds(subjectIds, activeChildSubjects);
    }
    const isPublished =
      profile!.onboardingStatus === ONBOARDING_STATUS.PUBLISHED;
    const protectedFields = [
      "displayName",
      "credentialsSummary",
      "expertise",
      "modality",
      "prices",
      "proofUrls",
    ] as const;
    const directData: Omit<UpdateProfileInput, "version" | "subjectIds"> & {
      pendingProfileChanges?: Record<string, unknown>;
      profileEditStatus?: string;
      profileEditAdminNote?: null;
    } = { ...data };

    if (isPublished) {
      const pendingProfileChanges = {
        ...(profile!.pendingProfileChanges as Record<string, unknown> | null),
      };
      for (const field of protectedFields) {
        if (
          data[field] !== undefined &&
          JSON.stringify(data[field]) !== JSON.stringify(profile![field])
        ) {
          pendingProfileChanges[field] = data[field];
        }
        delete directData[field];
      }
      if (Object.keys(pendingProfileChanges).length > 0) {
        directData.pendingProfileChanges = pendingProfileChanges;
        directData.profileEditStatus = "pending_review";
        directData.profileEditAdminNote = null;
      }
      if (subjectIds !== undefined) {
        const currentSubjectIds = getSubjectRelations(profile!).map(
          (relation) => relation.subjectId,
        );
        if (haveSameSubjectIds(subjectIds, currentSubjectIds)) {
          delete pendingProfileChanges.subjectIds;
        } else {
          pendingProfileChanges.subjectIds = [...subjectIds];
        }
        if (Object.keys(pendingProfileChanges).length > 0) {
          directData.pendingProfileChanges = pendingProfileChanges;
          directData.profileEditStatus = "pending_review";
          directData.profileEditAdminNote = null;
        }
      }
    }

    const persist = async (conn: DbOrTx) => {
      const rows = await tutorRepo.updateProfileWithVersion(
        conn,
        userId,
        version,
        directData,
      );
      if (rows.length === 0)
        throw new OptimisticLockError(profile!.id, version);

      if (!isPublished && subjectIds !== undefined) {
        await tutorRepo.replaceProfileSubjects(
          conn,
          profile!.id,
          subjectIds,
        );
      }

      const updated = await tutorRepo.getByUserId(conn, userId);
      return projectTutorProfile(updated ?? rows[0]);
    };

    if (!isPublished && subjectIds !== undefined) {
      return db.transaction(persist);
    }
    return persist(db);
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

      return row
        ? {
            ...row,
            subjects: toNormalizedTutorSubjects(getSubjectRelations(profile)),
          }
        : row;
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

    return db.transaction(async (tx) => {
      // Serialize overlap checks per tutor so concurrent upserts cannot create
      // overlapping slots (L6).
      await lockTutorForBooking(tx, userId);

      const existing = await tutorRepo.listAvailability(tx, userId, {
        from: new Date(),
      });
      const overlapping = existing.filter((slot) => {
        if (input.id && slot.id === input.id) return false;
        return start < slot.endDate && end > slot.startDate;
      });
      const recurringOccurrences = input.isRecurring
        ? []
        : overlapping.filter((slot) => slot.isRecurring);
      await Promise.all(
        recurringOccurrences.map((occurrence) =>
          tutorRepo.deleteAvailability(tx, occurrence.id),
        ),
      );
      if (overlapping.some((slot) => !slot.isRecurring)) {
        throw new AvailabilitySlotOverlapError(userId);
      }

      const updated = await tutorRepo.upsertAvailability(tx, userId, {
        ...input,
        startDate: start,
        endDate: end,
      });
      // Ownership is enforced in the repo UPDATE via the tutorId predicate;
      // an update that matched no row means the slot does not belong to this
      // tutor (H1).
      if (input.id && !updated) {
        throw new TutorProfileNotFoundError(userId);
      }
      return updated;
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
      await lockTutorForBooking(tx, userId);
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

  async function replaceWeeklyAvailability(
    userId: string,
    input: {
      effectiveFrom: Date;
      repeatUntil: Date;
      ranges: Array<{
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        modality: "online" | "offline" | "both";
      }>;
    },
  ) {
    const occurrences: Array<{
      startDate: Date;
      endDate: Date;
      modality: "online" | "offline" | "both";
    }> = [];
    const firstDay = new Date(`${utcDateKey(input.effectiveFrom)}T00:00:00Z`);
    const lastDay = new Date(`${utcDateKey(input.repeatUntil)}T00:00:00Z`);

    for (
      let day = firstDay;
      day <= lastDay;
      day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    ) {
      for (const range of input.ranges) {
        if (day.getUTCDay() !== range.dayOfWeek) continue;
        const key = utcDateKey(day);
        occurrences.push({
          startDate: new Date(`${key}T${range.startTime}:00+07:00`),
          endDate: new Date(`${key}T${range.endTime}:00+07:00`),
          modality: range.modality,
        });
      }
    }

    const sorted = occurrences.toSorted(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );
    if (
      sorted.some(
        (occurrence, index) =>
          index > 0 && occurrence.startDate < sorted[index - 1]!.endDate,
      )
    ) {
      throw new AvailabilitySlotOverlapError(userId);
    }

    return db.transaction(async (tx) => {
      await lockTutorForBooking(tx, userId);
      await tutorRepo.deactivateFutureRecurringAvailability(
        tx,
        userId,
        input.effectiveFrom,
      );
      const existingOverrides = (
        await tutorRepo.listAvailability(tx, userId, {
          from: input.effectiveFrom,
        })
      ).filter((slot) => !slot.isRecurring);
      const withoutOverrideConflicts = sorted.filter(
        (occurrence) =>
          !existingOverrides.some(
            (slot) =>
              occurrence.startDate < slot.endDate &&
              occurrence.endDate > slot.startDate,
          ),
      );

      return Promise.all(
        withoutOverrideConflicts.map((occurrence) =>
          tutorRepo.upsertAvailability(tx, userId, {
            ...occurrence,
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
    replaceWeeklyAvailability,
    deleteAvailability,
    getMyPayouts,
  };
}

export type TutorService = ReturnType<typeof createTutorService>;
