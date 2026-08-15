import { eq, and, gte, sql } from "drizzle-orm";
import { tutorProfile, availabilitySlot } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export interface UpdateProfileInput {
  version: number;
  displayName?: string;
  shortBio?: string;
  credentialsSummary?: string;
  expertise?: string[];
  modality?: "online" | "offline" | "both";
  prices?: Record<string, number>;
  availabilitySummary?: string;
  proofUrls?: string[];
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
  });
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
  input: Omit<UpdateProfileInput, "version">,
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

export function createTutorRepo() {
  return {
    getByUserId,
    updateProfileWithVersion,
    updateStatus,
    listAvailability,
    upsertAvailability,
    deleteAvailability,
  };
}

export type TutorRepo = ReturnType<typeof createTutorRepo>;
