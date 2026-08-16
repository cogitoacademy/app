import { eq, desc, asc, and, gte, sql, type SQL } from "drizzle-orm";
import { availabilitySlot, tutorProfile } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";

export interface ListPublishedInput {
  search?: string;
  expertise?: string;
  modality?: "online" | "offline" | "both";
  limit: number;
  offset: number;
}

/**
 * Lists published tutor profiles with search/expertise/modality filters and pagination.
 *
 * @param conn - the database connection or active transaction
 * @param input - the list options (search, expertise, modality, limit, offset)
 * @returns the matching profiles with their user, newest published first
 */
async function listPublished(conn: DbOrTx, input: ListPublishedInput) {
  const conditions: SQL<unknown>[] = [
    eq(tutorProfile.onboardingStatus, "published"),
  ];

  if (input.modality) {
    conditions.push(eq(tutorProfile.modality, input.modality));
  }

  if (input.search) {
    const escaped = input.search
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const q = `%${escaped}%`;
    conditions.push(
      sql`(lower(${tutorProfile.displayName}) like lower(${q}) escape '\\' or lower(${tutorProfile.shortBio}) like lower(${q}) escape '\\' or lower(${tutorProfile.credentialsSummary}) like lower(${q}) escape '\\' or lower(coalesce(${tutorProfile.expertise}::text, '')) like lower(${q}) escape '\\')`,
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
    limit: input.limit,
    offset: input.offset,
    with: { user: true },
  });
}

/**
 * Fetches a published tutor profile by id with its user.
 *
 * @param conn - the database connection or active transaction
 * @param tutorId - the profile id
 * @returns the published profile, or null
 */
async function getProfileById(conn: DbOrTx, tutorId: string) {
  return conn.query.tutorProfile.findFirst({
    where: and(
      eq(tutorProfile.id, tutorId),
      eq(tutorProfile.onboardingStatus, "published"),
    ),
    with: { user: true },
  });
}

async function listFutureAvailability(conn: DbOrTx, tutorUserId: string) {
  return conn.query.availabilitySlot.findMany({
    where: and(
      eq(availabilitySlot.tutorId, tutorUserId),
      eq(availabilitySlot.isActive, true),
      gte(availabilitySlot.startDate, new Date()),
    ),
    orderBy: [asc(availabilitySlot.startDate)],
    limit: 30,
  });
}

export function createDiscoveryRepo(db: DbType) {
  return {
    listPublished(input: ListPublishedInput, conn?: DbOrTx) {
      return listPublished(conn ?? db, input);
    },
    getProfileById(tutorId: string, conn?: DbOrTx) {
      return getProfileById(conn ?? db, tutorId);
    },
    listFutureAvailability(tutorUserId: string, conn?: DbOrTx) {
      return listFutureAvailability(conn ?? db, tutorUserId);
    },
  };
}

export type DiscoveryRepo = ReturnType<typeof createDiscoveryRepo>;
