import {
  eq,
  desc,
  asc,
  and,
  gte,
  sql,
  type SQL,
  isNull,
} from "drizzle-orm";
import {
  availabilitySlot,
  subjectCategory,
  tutorProfile,
  tutorProfileSubject,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";

export interface ListPublishedInput {
  search?: string;
  expertise?: string;
  categoryId?: string;
  subjectId?: string;
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
      sql`(
        lower(${tutorProfile.displayName}) like lower(${q}) escape '\\'
        or lower(${tutorProfile.shortBio}) like lower(${q}) escape '\\'
        or lower(${tutorProfile.credentialsSummary}) like lower(${q}) escape '\\'
        or lower(coalesce(${tutorProfile.expertise}::text, '')) like lower(${q}) escape '\\'
        or exists (
          select 1
          from ${tutorProfileSubject}
          inner join ${subjectCategory}
            on ${tutorProfileSubject.subjectId} = ${subjectCategory.id}
          where ${tutorProfileSubject.tutorProfileId} = ${tutorProfile.id}
            and ${subjectCategory.isActive} = true
            and lower(${subjectCategory.name}) like lower(${q}) escape '\\'
        )
      )`,
    );
  }

  if (input.expertise) {
    conditions.push(
      sql`${tutorProfile.expertise} @> ${JSON.stringify([input.expertise])}::jsonb`,
    );
  }

  if (input.categoryId || input.subjectId) {
    conditions.push(
      sql`exists (
        select 1
        from ${tutorProfileSubject}
        inner join ${subjectCategory}
          on ${tutorProfileSubject.subjectId} = ${subjectCategory.id}
        where ${tutorProfileSubject.tutorProfileId} = ${tutorProfile.id}
          and ${subjectCategory.isActive} = true
          and ${subjectCategory.parentId} is not null
          ${input.categoryId ? sql`and ${subjectCategory.parentId} = ${input.categoryId}` : sql``}
          ${input.subjectId ? sql`and ${subjectCategory.id} = ${input.subjectId}` : sql``}
      )`,
    );
  }

  return conn.query.tutorProfile.findMany({
    where: and(...conditions),
    orderBy: [desc(tutorProfile.publishedAt)],
    limit: input.limit,
    offset: input.offset,
    with: {
      user: true,
      subjects: { with: { subject: { with: { parent: true } } } },
    },
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
    with: {
      user: true,
      subjects: { with: { subject: { with: { parent: true } } } },
    },
  });
}

async function listSubjects(conn: DbOrTx) {
  return conn.query.subjectCategory.findMany({
    where: and(eq(subjectCategory.isActive, true), isNull(subjectCategory.parentId)),
    orderBy: [asc(subjectCategory.sortOrder), asc(subjectCategory.name)],
    with: {
      children: {
        where: eq(subjectCategory.isActive, true),
        orderBy: [asc(subjectCategory.sortOrder), asc(subjectCategory.name)],
      },
    },
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
    listSubjects(conn?: DbOrTx) {
      return listSubjects(conn ?? db);
    },
    listFutureAvailability(tutorUserId: string, conn?: DbOrTx) {
      return listFutureAvailability(conn ?? db, tutorUserId);
    },
  };
}

export type DiscoveryRepo = ReturnType<typeof createDiscoveryRepo>;
