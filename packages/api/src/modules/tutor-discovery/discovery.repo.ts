import { eq, desc, asc, and, gte, isNull, sql, type SQL } from "drizzle-orm";
import {
  availabilitySlot,
  subjectCategory,
  tutorProfile,
  user,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";

const SAFE_TUTOR_USER_COLUMNS = {
  id: true,
  name: true,
  image: true,
  role: true,
} as const;

const tutorProfileSubjectFilterTable = sql.raw(
  '"tutor_profile_subject" as "tutorProfileSubjectFilter"',
);
const subjectCategoryFilterTable = sql.raw(
  '"subject_category" as "subjectCategoryFilter"',
);
const tutorProfileSubjectFilterSubjectId = sql.raw(
  '"tutorProfileSubjectFilter"."subject_id"',
);
const subjectCategoryFilterId = sql.raw('"subjectCategoryFilter"."id"');
const tutorProfileSubjectFilterTutorProfileId = sql.raw(
  '"tutorProfileSubjectFilter"."tutor_profile_id"',
);
const subjectCategoryFilterIsActive = sql.raw(
  '"subjectCategoryFilter"."is_active"',
);
const subjectCategoryFilterName = sql.raw('"subjectCategoryFilter"."name"');
const subjectCategoryFilterParentId = sql.raw(
  '"subjectCategoryFilter"."parent_id"',
);

export interface ListPublishedInput {
  search?: string;
  expertise?: string;
  categoryId?: string;
  subjectId?: string;
  categoryIds?: string[];
  subjectIds?: string[];
  modality?: "online" | "offline" | "both";
  limit: number;
  offset: number;
}

function normalizeFilterIds(
  ids: readonly string[] | undefined,
  id: string | undefined,
) {
  return [...new Set(ids?.length ? ids : id ? [id] : [])];
}

function sqlValueList(values: readonly string[]) {
  return sql`(${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;
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
        exists (
          select 1 from ${user}
          where ${user.id} = ${tutorProfile.userId}
            and lower(${user.name}) like lower(${q}) escape '\\'
        )
        or lower(${tutorProfile.shortBio}) like lower(${q}) escape '\\'
        or lower(${tutorProfile.credentialsSummary}) like lower(${q}) escape '\\'
        or lower(coalesce(${tutorProfile.expertise}::text, '')) like lower(${q}) escape '\\'
        or exists (
          select 1
          from ${tutorProfileSubjectFilterTable}
          inner join ${subjectCategoryFilterTable}
            on ${tutorProfileSubjectFilterSubjectId} = ${subjectCategoryFilterId}
          where ${tutorProfileSubjectFilterTutorProfileId} = ${tutorProfile.id}
            and ${subjectCategoryFilterIsActive} = true
            and lower(${subjectCategoryFilterName}) like lower(${q}) escape '\\'
        )
      )`,
    );
  }

  if (input.expertise) {
    conditions.push(
      sql`${tutorProfile.expertise} @> ${JSON.stringify([input.expertise])}::jsonb`,
    );
  }

  const categoryIds = normalizeFilterIds(input.categoryIds, input.categoryId);
  const subjectIds = normalizeFilterIds(input.subjectIds, input.subjectId);

  if (categoryIds.length > 0 || subjectIds.length > 0) {
    conditions.push(sql`exists (
      select 1
      from ${tutorProfileSubjectFilterTable}
      inner join ${subjectCategoryFilterTable}
        on ${tutorProfileSubjectFilterSubjectId} = ${subjectCategoryFilterId}
        where ${tutorProfileSubjectFilterTutorProfileId} = ${tutorProfile.id}
        and ${subjectCategoryFilterIsActive} = true
        and ${subjectCategoryFilterParentId} is not null
        ${categoryIds.length > 0 ? sql`and ${subjectCategoryFilterParentId} in ${sqlValueList(categoryIds)}` : sql``}
        ${subjectIds.length > 0 ? sql`and ${subjectCategoryFilterId} in ${sqlValueList(subjectIds)}` : sql``}
    )`);
  }

  return conn.query.tutorProfile.findMany({
    columns: {
      bankName: false,
      bankAccountNumber: false,
      bankAccountHolderName: false,
      bankAccountOpeningCity: false,
      bankAccountOwnership: false,
      bankTransferDisclaimerAccepted: false,
      termsOfServiceAcceptedAt: false,
      termsOfServiceVersion: false,
    },
    where: and(...conditions),
    orderBy: [desc(tutorProfile.publishedAt)],
    limit: input.limit,
    offset: input.offset,
    with: {
      user: { columns: SAFE_TUTOR_USER_COLUMNS },
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
    columns: {
      bankName: false,
      bankAccountNumber: false,
      bankAccountHolderName: false,
      bankAccountOpeningCity: false,
      bankAccountOwnership: false,
      bankTransferDisclaimerAccepted: false,
      termsOfServiceAcceptedAt: false,
      termsOfServiceVersion: false,
    },
    where: and(
      eq(tutorProfile.id, tutorId),
      eq(tutorProfile.onboardingStatus, "published"),
    ),
    with: {
      user: { columns: SAFE_TUTOR_USER_COLUMNS },
      subjects: { with: { subject: { with: { parent: true } } } },
    },
  });
}

async function listSubjects(conn: DbOrTx) {
  return conn.query.subjectCategory.findMany({
    where: and(
      eq(subjectCategory.isActive, true),
      isNull(subjectCategory.parentId),
    ),
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
