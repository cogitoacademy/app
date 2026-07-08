import { eq } from "drizzle-orm";
import { tutorProfile } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export interface UpdateProfileInput {
  displayName?: string;
  shortBio?: string;
  credentialsSummary?: string;
  expertise?: string[];
  modality?: "online" | "offline" | "both";
  prices?: Record<string, number>;
  availabilitySummary?: string;
  proofUrls?: string[];
}

export function createTutorRepo() {
  async function getByUserId(conn: DbOrTx, userId: string) {
    return conn.query.tutorProfile.findFirst({
      where: eq(tutorProfile.userId, userId),
    });
  }

  async function updateProfile(
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

  async function updateStatus(conn: DbOrTx, userId: string, status: string) {
    const [updated] = await conn
      .update(tutorProfile)
      .set({ onboardingStatus: status })
      .where(eq(tutorProfile.userId, userId))
      .returning();
    return updated;
  }

  return { getByUserId, updateProfile, updateStatus };
}

export type TutorRepo = ReturnType<typeof createTutorRepo>;
