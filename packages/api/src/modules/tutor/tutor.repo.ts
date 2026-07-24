import { eq, and, gte, sql } from "drizzle-orm";
import { tutorProfile, availabilitySlot } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export interface UpdateProfileInput {
  version?: number;
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

export async function getByUserId(conn: DbOrTx, userId: string) {
  return conn.query.tutorProfile.findFirst({
    where: eq(tutorProfile.userId, userId),
  });
}

export async function updateProfile(
  conn: DbOrTx,
  userId: string,
  input: UpdateProfileInput,
) {
  const [updated] = await conn
    .update(tutorProfile)
    .set(input)
    .where(eq(tutorProfile.userId, userId))
    .returning();
  return updated;
}

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
      .where(eq(availabilitySlot.id, input.id))
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

export async function deleteAvailability(conn: DbOrTx, slotId: string) {
  await conn
    .update(availabilitySlot)
    .set({ isActive: false })
    .where(eq(availabilitySlot.id, slotId));
}

export function createTutorRepo() {
  return {
    getByUserId,
    updateProfile,
    updateProfileWithVersion,
    updateStatus,
    listAvailability,
    upsertAvailability,
    deleteAvailability,
  };
}

export type TutorRepo = ReturnType<typeof createTutorRepo>;
