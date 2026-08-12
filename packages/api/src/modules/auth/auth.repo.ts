import { eq } from "drizzle-orm";
import { studentProfile, tutorProfile } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export interface ProfileInput {
  phoneNumber?: string;
  schoolName?: string;
  gradeLevel?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
}

export type StudentProfileRow = typeof studentProfile.$inferSelect;
export type TutorProfileRow = typeof tutorProfile.$inferSelect;

/**
 * Fetches a user's student profile.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the student profile row, or null
 */
async function getStudentProfile(
  conn: DbOrTx,
  userId: string,
): Promise<StudentProfileRow | null> {
  return (
    (await conn.query.studentProfile.findFirst({
      where: eq(studentProfile.userId, userId),
    })) ?? null
  );
}

/**
 * Fetches a user's tutor profile.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the tutor profile row, or null
 */
async function getTutorProfile(
  conn: DbOrTx,
  userId: string,
): Promise<TutorProfileRow | null> {
  return (
    (await conn.query.tutorProfile.findFirst({
      where: eq(tutorProfile.userId, userId),
    })) ?? null
  );
}

/**
 * Updates an existing student profile with the given input.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param input - the profile fields to update
 * @returns the updated student profile row
 */
async function upsertProfile(
  conn: DbOrTx,
  userId: string,
  input: ProfileInput,
): Promise<StudentProfileRow> {
  const [updated] = await conn
    .update(studentProfile)
    .set(input)
    .where(eq(studentProfile.userId, userId))
    .returning();
  return updated!;
}

/**
 * Creates a new student profile for a user.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param input - the initial profile fields
 * @returns the created student profile row
 */
async function createProfile(
  conn: DbOrTx,
  userId: string,
  input: ProfileInput,
): Promise<StudentProfileRow> {
  const [created] = await conn
    .insert(studentProfile)
    .values({ userId, ...input })
    .returning();
  return created!;
}

export function createAuthRepo() {
  return { getStudentProfile, getTutorProfile, upsertProfile, createProfile };
}

export type AuthRepo = ReturnType<typeof createAuthRepo>;
