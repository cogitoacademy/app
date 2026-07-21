import { eq, desc, and, sql, type SQL } from "drizzle-orm";
import { tutorProfile } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export interface ListPublishedInput {
  search?: string;
  expertise?: string;
  modality?: "online" | "offline" | "both";
  limit?: number;
  offset?: number;
}

async function listPublished(conn: DbOrTx, input: ListPublishedInput = {}) {
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;

  const conditions: SQL<unknown>[] = [
    eq(tutorProfile.onboardingStatus, "published"),
  ];

  if (input.modality) {
    conditions.push(eq(tutorProfile.modality, input.modality));
  }

  if (input.search) {
    const q = `%${input.search}%`;
    conditions.push(
      sql`(lower(${tutorProfile.displayName}) like lower(${q}) or lower(${tutorProfile.shortBio}) like lower(${q}) or lower(${tutorProfile.credentialsSummary}) like lower(${q}))`,
    );
  }

  if (input.expertise) {
    conditions.push(
      sql`${tutorProfile.expertise} @> ${JSON.stringify([input.expertise])}::jsonb`,
    );
  }

  return conn.query.tutorProfile.findMany({
    where: and(...conditions),
    orderBy: [desc(tutorProfile.publishedAt)],
    limit,
    offset,
    with: { user: true },
  });
}

async function getProfileById(conn: DbOrTx, tutorId: string) {
  return conn.query.tutorProfile.findFirst({
    where: and(
      eq(tutorProfile.id, tutorId),
      eq(tutorProfile.onboardingStatus, "published"),
    ),
    with: { user: true },
  });
}

export function createDiscoveryRepo() {
  return { listPublished, getProfileById };
}

export type DiscoveryRepo = ReturnType<typeof createDiscoveryRepo>;
