import { eq, and, gte, sql, asc, inArray, isNotNull } from "drizzle-orm";
import {
  tutorProfile,
  availabilitySlot,
  subjectCategory,
  tutorProfileSubject,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export interface UpdateProfileInput {
  version: number;
  displayName?: string;
  shortBio?: string;
  achievements?: string;
  experiences?: string;
  achievementProofUrls?: string[];
  experienceProofUrls?: string[];
  sourcePhotoUrl?: string;
  expertise?: string[];
  subjectIds?: string[];
  modality?: "online" | "offline" | "both";
  baseRatesIdr?: Partial<{ online: number; offline: number }>;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolderName?: string;
  bankAccountOpeningCity?: string;
  bankAccountOwnership?: "self" | "trusted_person";
  bankTransferDisclaimerAccepted?: boolean;
  prices?: Record<string, number>;
}

export interface PersistedProfileUpdate extends Omit<
  UpdateProfileInput,
  "version" | "subjectIds"
> {
  pendingProfileChanges?: Record<string, unknown>;
  profileEditStatus?: string;
  profileEditAdminNote?: string | null;
}

export interface UpsertAvailabilityInput {
  id?: string;
  startDate: Date;
  endDate: Date;
  modality: "online" | "offline" | "both";
  isRecurring?: boolean;
  recurrenceRule?: string;
  isActive?: boolean;
}

/**
 * Fetches a tutor's profile by user id.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the tutor profile, or null
 */
export async function getByUserId(conn: DbOrTx, userId: string) {
  return conn.query.tutorProfile.findFirst({
    where: eq(tutorProfile.userId, userId),
    with: {
      subjects: {
        with: {
          subject: {
            with: { parent: true },
          },
        },
      },
    },
  });
}

/**
 * Finds active child subjects by id. Parent categories are deliberately
 * excluded so arbitrary expertise strings or mother ids cannot be persisted
 * as tutor selections.
 */
export async function listActiveChildSubjects(
  conn: DbOrTx,
  subjectIds: readonly string[],
) {
  if (subjectIds.length === 0) return [];

  return conn.query.subjectCategory.findMany({
    where: and(
      inArray(subjectCategory.id, [...subjectIds]),
      eq(subjectCategory.isActive, true),
      isNotNull(subjectCategory.parentId),
    ),
    orderBy: [asc(subjectCategory.sortOrder), asc(subjectCategory.name)],
  });
}

/**
 * Replaces a tutor's normalized subject selections. Callers must validate the
 * ids before invoking this function; the enclosing transaction makes the
 * profile update and join-row replacement atomic.
 */
export async function replaceProfileSubjects(
  conn: DbOrTx,
  tutorProfileId: string,
  subjectIds: readonly string[],
) {
  await conn
    .delete(tutorProfileSubject)
    .where(eq(tutorProfileSubject.tutorProfileId, tutorProfileId));

  if (subjectIds.length === 0) return [];

  return conn
    .insert(tutorProfileSubject)
    .values(
      subjectIds.map((subjectId) => ({
        tutorProfileId,
        subjectId,
      })),
    )
    .returning();
}

/**
 * Updates a tutor profile with optimistic concurrency via version.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param expectedVersion - the version the profile must currently have
 * @param input - the fields to update
 * @returns the updated rows (empty when the version did not match)
 */
export async function updateProfileWithVersion(
  conn: DbOrTx,
  userId: string,
  expectedVersion: number,
  input: PersistedProfileUpdate,
) {
  const rows = await conn
    .update(tutorProfile)
    .set({ ...input, version: sql`${tutorProfile.version} + 1` })
    .where(
      and(
        eq(tutorProfile.userId, userId),
        eq(tutorProfile.version, expectedVersion),
      ),
    )
    .returning();
  return rows;
}

/**
 * Updates a tutor profile's onboarding status.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param status - the new onboarding status
 * @returns the updated profile row, or undefined when not found
 */
export async function updateStatus(
  conn: DbOrTx,
  userId: string,
  status: string,
) {
  const [updated] = await conn
    .update(tutorProfile)
    .set({ onboardingStatus: status })
    .where(eq(tutorProfile.userId, userId))
    .returning();
  return updated;
}

/**
 * Lists a tutor's active availability slots, optionally from a start date.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param opts - options (from date filter)
 * @returns the matching availability slot rows
 */
export async function listAvailability(
  conn: DbOrTx,
  userId: string,
  opts?: { from?: Date },
) {
  const conditions = [
    eq(availabilitySlot.tutorId, userId),
    eq(availabilitySlot.isActive, true),
  ];
  if (opts?.from) {
    conditions.push(gte(availabilitySlot.startDate, opts.from));
  }
  return conn
    .select()
    .from(availabilitySlot)
    .where(and(...conditions));
}

/**
 * Creates or updates an availability slot (by id when provided, else inserts).
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param input - the slot details
 * @returns the created or updated slot row
 */
export async function upsertAvailability(
  conn: DbOrTx,
  userId: string,
  input: UpsertAvailabilityInput,
) {
  if (input.id) {
    const [updated] = await conn
      .update(availabilitySlot)
      .set({
        startDate: input.startDate,
        endDate: input.endDate,
        modality: input.modality,
        isRecurring: input.isRecurring ?? false,
        recurrenceRule: input.recurrenceRule ?? null,
        isActive: input.isActive ?? true,
      })
      .where(
        and(
          eq(availabilitySlot.id, input.id),
          eq(availabilitySlot.tutorId, userId),
        ),
      )
      .returning();
    return updated;
  }
  const [created] = await conn
    .insert(availabilitySlot)
    .values({
      tutorId: userId,
      startDate: input.startDate,
      endDate: input.endDate,
      modality: input.modality,
      isRecurring: input.isRecurring ?? false,
      recurrenceRule: input.recurrenceRule ?? null,
      isActive: input.isActive ?? true,
    })
    .onConflictDoUpdate({
      target: [
        availabilitySlot.tutorId,
        availabilitySlot.startDate,
        availabilitySlot.endDate,
      ],
      set: {
        modality: input.modality,
        isRecurring: input.isRecurring ?? false,
        recurrenceRule: input.recurrenceRule ?? null,
        isActive: input.isActive ?? true,
      },
    })
    .returning();
  return created;
}

/**
 * Soft-deletes an availability slot by setting isActive to false.
 *
 * @param conn - the database connection or active transaction
 * @param slotId - the slot id
 */
export async function deleteAvailability(conn: DbOrTx, slotId: string) {
  await conn
    .update(availabilitySlot)
    .set({ isActive: false })
    .where(eq(availabilitySlot.id, slotId));
}

export async function deactivateFutureRecurringAvailability(
  conn: DbOrTx,
  userId: string,
  from: Date,
) {
  await conn
    .update(availabilitySlot)
    .set({ isActive: false })
    .where(
      and(
        eq(availabilitySlot.tutorId, userId),
        eq(availabilitySlot.isRecurring, true),
        eq(availabilitySlot.isActive, true),
        gte(availabilitySlot.startDate, from),
      ),
    );
}

export function createTutorRepo() {
  return {
    getByUserId,
    listActiveChildSubjects,
    replaceProfileSubjects,
    updateProfileWithVersion,
    updateStatus,
    listAvailability,
    upsertAvailability,
    deleteAvailability,
    deactivateFutureRecurringAvailability,
  };
}

export type TutorRepo = ReturnType<typeof createTutorRepo>;
