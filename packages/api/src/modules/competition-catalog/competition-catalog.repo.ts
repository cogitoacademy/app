import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import {
  booking,
  bookingSession,
  economyV3Revision,
  auditLog,
  subjectCategory,
  tutorProfile,
  tutorProfileSubject,
} from "@cogito-app/db/schema";
import { DEFAULT_V3_ECONOMY_CONFIG } from "../pricing/v3-economy.config";
import type { DbOrTx } from "../../lib/tx";
import type {
  CreateCompetitionParentInput,
  CreateCompetitionSpecializationInput,
  UpdateCompetitionCatalogEntryInput,
} from "./competition-catalog.types";

export type CompetitionCatalogRow = typeof subjectCategory.$inferSelect;
export type CompetitionCatalogRepo = ReturnType<
  typeof createCompetitionCatalogRepo
>;

export async function listCompetitionCatalog(
  conn: DbOrTx,
  input: { query?: string; includeArchived: boolean },
) {
  const rows = await conn.query.subjectCategory.findMany({
    with: { parent: true },
    orderBy: [asc(subjectCategory.sortOrder), asc(subjectCategory.name)],
  });
  const query = input.query?.toLocaleLowerCase();

  return rows.filter((row) => {
    const selectable =
      row.isActive && (row.parentId === null || row.parent?.isActive === true);
    if (!input.includeArchived && !selectable) return false;
    if (!query) return true;
    return [
      row.slug,
      row.name,
      row.nameId,
      row.description,
      row.descriptionId,
      row.parent?.name,
      row.parent?.nameId,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

export async function getCompetitionCatalogEntry(conn: DbOrTx, id: string) {
  return conn.query.subjectCategory.findFirst({
    where: eq(subjectCategory.id, id),
    with: {
      parent: true,
      children: {
        orderBy: [asc(subjectCategory.sortOrder), asc(subjectCategory.name)],
      },
    },
  });
}

export async function getCompetitionCatalogEntryBySlug(
  conn: DbOrTx,
  slug: string,
) {
  return conn.query.subjectCategory.findFirst({
    where: eq(subjectCategory.slug, slug),
    with: { parent: true },
  });
}

export async function getCompetitionCatalogEntriesByReferences(
  conn: DbOrTx,
  input: { ids: readonly string[]; slugs: readonly string[] },
) {
  const conditions = [];
  if (input.ids.length > 0) {
    conditions.push(inArray(subjectCategory.id, [...input.ids]));
  }
  if (input.slugs.length > 0) {
    conditions.push(inArray(subjectCategory.slug, [...input.slugs]));
  }
  if (conditions.length === 0) return [];
  return conn.query.subjectCategory.findMany({
    where: or(...conditions),
    with: { parent: true },
  });
}

export async function listCompetitionCatalogChildren(
  conn: DbOrTx,
  parentId: string,
) {
  return conn
    .select()
    .from(subjectCategory)
    .where(eq(subjectCategory.parentId, parentId))
    .orderBy(asc(subjectCategory.sortOrder), asc(subjectCategory.name));
}

export async function insertCompetitionParent(
  conn: DbOrTx,
  input: CreateCompetitionParentInput,
) {
  const [row] = await conn
    .insert(subjectCategory)
    .values({
      parentId: null,
      slug: input.slug,
      name: input.name,
      nameId: input.nameId ?? null,
      description: input.description ?? null,
      descriptionId: input.descriptionId ?? null,
      lightTextColor: input.lightTextColor,
      lightBackgroundColor: input.lightBackgroundColor,
      darkTextColor: input.darkTextColor,
      darkBackgroundColor: input.darkBackgroundColor,
      sortOrder: input.sortOrder,
      isActive: false,
    })
    .returning();
  return row!;
}

export async function insertCompetitionSpecialization(
  conn: DbOrTx,
  input: CreateCompetitionSpecializationInput,
  isActive: boolean,
) {
  const [row] = await conn
    .insert(subjectCategory)
    .values({
      parentId: input.parentId,
      slug: input.slug,
      name: input.name,
      nameId: input.nameId ?? null,
      description: input.description ?? null,
      descriptionId: input.descriptionId ?? null,
      sortOrder: input.sortOrder,
      isActive,
    })
    .returning();
  return row!;
}

export async function updateCompetitionCatalogEntry(
  conn: DbOrTx,
  input: UpdateCompetitionCatalogEntryInput,
) {
  const [row] = await conn
    .update(subjectCategory)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameId !== undefined ? { nameId: input.nameId } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.descriptionId !== undefined
        ? { descriptionId: input.descriptionId }
        : {}),
      ...(input.lightTextColor !== undefined
        ? { lightTextColor: input.lightTextColor }
        : {}),
      ...(input.lightBackgroundColor !== undefined
        ? { lightBackgroundColor: input.lightBackgroundColor }
        : {}),
      ...(input.darkTextColor !== undefined
        ? { darkTextColor: input.darkTextColor }
        : {}),
      ...(input.darkBackgroundColor !== undefined
        ? { darkBackgroundColor: input.darkBackgroundColor }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      version: sql`${subjectCategory.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subjectCategory.id, input.id),
        eq(subjectCategory.version, input.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

export async function setCompetitionCatalogEntryActive(
  conn: DbOrTx,
  input: { id: string; expectedVersion: number; isActive: boolean },
) {
  const [row] = await conn
    .update(subjectCategory)
    .set({
      isActive: input.isActive,
      version: sql`${subjectCategory.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subjectCategory.id, input.id),
        eq(subjectCategory.version, input.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

export async function moveCompetitionSpecialization(
  conn: DbOrTx,
  input: { id: string; parentId: string; expectedVersion: number },
  isActive: boolean,
) {
  const [row] = await conn
    .update(subjectCategory)
    .set({
      parentId: input.parentId,
      isActive,
      version: sql`${subjectCategory.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subjectCategory.id, input.id),
        eq(subjectCategory.version, input.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteCompetitionCatalogEntry(
  conn: DbOrTx,
  input: { id: string; expectedVersion: number },
) {
  const [row] = await conn
    .delete(subjectCategory)
    .where(
      and(
        eq(subjectCategory.id, input.id),
        eq(subjectCategory.version, input.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

async function countRows(query: PromiseLike<Array<{ count: number }>>) {
  const [row] = await query;
  return Number(row?.count ?? 0);
}

function textArray(values: string[]) {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

export async function countCompetitionCatalogReferences(
  conn: DbOrTx,
  entries: readonly Pick<CompetitionCatalogRow, "id" | "slug">[],
) {
  const ids = entries.map((entry) => entry.id);
  const slugs = entries.map((entry) => entry.slug);
  if (ids.length === 0) {
    return {
      tutorAssignments: 0,
      pendingProfileEdits: 0,
      bookings: 0,
      bookingSessions: 0,
      historicalTutorProfileAudits: 0,
      economyRevisions: 0,
      defaultRates: 0,
    };
  }

  const tutorAssignments = await countRows(
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(tutorProfileSubject)
      .where(inArray(tutorProfileSubject.subjectId, ids)),
  );
  const pendingProfileEdits = await countRows(
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(tutorProfile)
      .where(
        sql`coalesce(${tutorProfile.pendingProfileChanges}->'subjectIds', '[]'::jsonb) ?| ${textArray(ids)}`,
      ),
  );
  const historicalTutorProfileAudits = await countRows(
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetType, "tutor_profile"),
          or(
            sql`coalesce(${auditLog.beforeState}->'subjectIds', '[]'::jsonb) ?| ${textArray(ids)}`,
            sql`coalesce(${auditLog.afterState}->'subjectIds', '[]'::jsonb) ?| ${textArray(ids)}`,
            sql`coalesce(${auditLog.beforeState}->'pendingProfileChanges'->'subjectIds', '[]'::jsonb) ?| ${textArray(ids)}`,
            sql`coalesce(${auditLog.afterState}->'pendingProfileChanges'->'subjectIds', '[]'::jsonb) ?| ${textArray(ids)}`,
          ),
        ),
      ),
  );
  const bookings = await countRows(
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(booking)
      .where(
        or(
          inArray(sql<string>`${booking.sessionTopic}->>'categoryId'`, ids),
          inArray(sql<string>`${booking.sessionTopic}->>'categorySlug'`, slugs),
          inArray(sql<string>`${booking.sessionTopic}->>'subcategoryId'`, ids),
          inArray(
            sql<string>`${booking.sessionTopic}->>'subcategorySlug'`,
            slugs,
          ),
          inArray(sql<string>`${booking.priceSnapshot}->>'competition'`, slugs),
        ),
      ),
  );
  const economyRevisions = await countRows(
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(economyV3Revision)
      .where(
        sql`coalesce(${economyV3Revision.values}->'competitionRates', '{}'::jsonb) ?| ${textArray(slugs)}`,
      ),
  );
  const bookingSessions = await countRows(
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingSession)
      .where(
        inArray(
          sql<string>`${bookingSession.priceSnapshot}->>'competition'`,
          slugs,
        ),
      ),
  );
  const defaultRates = slugs.filter((slug) =>
    Object.hasOwn(DEFAULT_V3_ECONOMY_CONFIG.competitionRates, slug),
  ).length;

  return {
    tutorAssignments,
    pendingProfileEdits,
    bookings,
    bookingSessions,
    historicalTutorProfileAudits,
    economyRevisions,
    defaultRates,
  };
}

export async function countCompetitionCatalogChildren(
  conn: DbOrTx,
  parentId: string,
) {
  return countRows(
    conn
      .select({ count: sql<number>`count(*)::int` })
      .from(subjectCategory)
      .where(eq(subjectCategory.parentId, parentId)),
  );
}

export function createCompetitionCatalogRepo() {
  return {
    listCompetitionCatalog,
    getCompetitionCatalogEntry,
    getCompetitionCatalogEntryBySlug,
    getCompetitionCatalogEntriesByReferences,
    listCompetitionCatalogChildren,
    insertCompetitionParent,
    insertCompetitionSpecialization,
    updateCompetitionCatalogEntry,
    setCompetitionCatalogEntryActive,
    moveCompetitionSpecialization,
    deleteCompetitionCatalogEntry,
    countCompetitionCatalogReferences,
    countCompetitionCatalogChildren,
  };
}
