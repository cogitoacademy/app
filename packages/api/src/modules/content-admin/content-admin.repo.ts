import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  calendarEvent,
  calendarEventCategory,
  kbFile,
  kbResource,
  subjectCategory,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../audit/audit.service";
import { lockCompetitionCatalog } from "../competition-catalog/catalog-lock";
import type { ContentEntry, ContentKind } from "./content-admin.types";
import {
  ContentConflictError,
  ContentInvalidError,
} from "./content-admin.errors";

export function createContentAdminRepo(db: DbType, audit: AuditPort) {
  async function list(kind: ContentKind, activeOnly = false) {
    if (kind === "resource")
      return db
        .select({ resource: kbResource, fileName: kbFile.fileName })
        .from(kbResource)
        .innerJoin(kbFile, eq(kbResource.fileId, kbFile.id))
        .where(activeOnly ? eq(kbResource.isActive, true) : undefined)
        .orderBy(
          asc(kbResource.sortOrder),
          asc(kbResource.title),
          asc(kbResource.id),
        )
        .then((rows) =>
          rows.map(({ resource, fileName }) => ({ ...resource, fileName })),
        );
    const rows = await db
      .select()
      .from(calendarEvent)
      .where(activeOnly ? eq(calendarEvent.isActive, true) : undefined)
      .orderBy(asc(calendarEvent.startDate), asc(calendarEvent.id));
    const categories = await db.select().from(calendarEventCategory);
    return rows.map((row) => ({
      ...row,
      categoryIds: categories
        .filter((c) => c.eventId === row.id)
        .map((c) => c.categoryId)
        .toSorted(),
    }));
  }
  return {
    list,
    resources: () =>
      db
        .select({
          id: kbResource.id,
          title: kbResource.title,
          description: kbResource.description,
          category: kbResource.category,
        })
        .from(kbResource)
        .where(eq(kbResource.isActive, true))
        .orderBy(
          asc(kbResource.sortOrder),
          asc(kbResource.title),
          asc(kbResource.id),
        ),
    events: () =>
      db
        .select()
        .from(calendarEvent)
        .where(eq(calendarEvent.isActive, true))
        .orderBy(asc(calendarEvent.startDate), asc(calendarEvent.id)),
    eventCategories: () =>
      db
        .select()
        .from(calendarEventCategory)
        .innerJoin(
          subjectCategory,
          eq(calendarEventCategory.categoryId, subjectCategory.id),
        ),
    categories: () =>
      db
        .select()
        .from(subjectCategory)
        .orderBy(asc(subjectCategory.sortOrder), asc(subjectCategory.id)),
    async file(id: string) {
      return (await db.select().from(kbFile).where(eq(kbFile.id, id)))[0];
    },
    async resourceFile(id: string) {
      return (
        await db
          .select({ file: kbFile })
          .from(kbResource)
          .innerJoin(kbFile, eq(kbResource.fileId, kbFile.id))
          .where(and(eq(kbResource.id, id), eq(kbResource.isActive, true)))
      )[0]?.file;
    },
    async registerFile(values: typeof kbFile.$inferInsert) {
      await db.insert(kbFile).values(values).onConflictDoNothing();
      const row = (
        await db.select().from(kbFile).where(eq(kbFile.id, values.id))
      )[0];
      if (
        !row ||
        row.storageKey !== values.storageKey ||
        row.bytes !== values.bytes ||
        row.sha256 !== values.sha256
      )
        throw new ContentInvalidError("Private file identity conflict");
      return row;
    },
    async save(
      entry: ContentEntry,
      actorId: string,
      reason: string,
      existing?: { id: string; expectedVersion: number },
      identity?: { id: string; sourceId: string; sourceHash: string },
    ) {
      return db.transaction(async (tx) => {
        await lockCompetitionCatalog(tx);
        const table = entry.kind === "resource" ? kbResource : calendarEvent;
        const id = existing?.id ?? identity?.id ?? crypto.randomUUID();
        const before = (
          await tx.select().from(table).where(eq(table.id, id)).for("update")
        )[0];
        if (
          existing
            ? !before || before.version !== existing.expectedVersion
            : !!before
        )
          throw new ContentConflictError();
        const beforeCategoryIds =
          entry.kind === "event" && before
            ? (
                await tx
                  .select()
                  .from(calendarEventCategory)
                  .where(eq(calendarEventCategory.eventId, id))
              )
                .map((c) => c.categoryId)
                .toSorted()
            : undefined;
        let after;
        if (entry.kind === "resource") {
          if (
            !(
              await tx
                .select({ id: kbFile.id })
                .from(kbFile)
                .where(eq(kbFile.id, entry.values.fileId))
            )[0]
          )
            throw new ContentInvalidError("Upload a private PDF before saving");
          after = existing
            ? (
                await tx
                  .update(kbResource)
                  .set({
                    ...entry.values,
                    version: sql`${kbResource.version} + 1`,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(kbResource.id, id),
                      eq(kbResource.version, existing.expectedVersion),
                    ),
                  )
                  .returning()
              )[0]
            : (
                await tx
                  .insert(kbResource)
                  .values({
                    ...entry.values,
                    id,
                    sourceId: identity?.sourceId,
                    sourceHash: identity?.sourceHash,
                  })
                  .returning()
              )[0];
        } else {
          const { categoryIds, ...fields } = entry.values;
          const previousCategories = before
            ? await tx
                .select()
                .from(calendarEventCategory)
                .where(eq(calendarEventCategory.eventId, id))
            : [];
          const categories = categoryIds.length
            ? await tx
                .select()
                .from(subjectCategory)
                .where(inArray(subjectCategory.id, categoryIds))
            : [];
          if (
            categories.length !== categoryIds.length ||
            categories.some(
              (c) =>
                c.parentId !== null ||
                (!c.isActive &&
                  !previousCategories.some((p) => p.categoryId === c.id)),
            )
          )
            throw new ContentInvalidError(
              "Choose existing active parent competitions; existing archived categories may be retained",
            );
          const values = {
            ...fields,
            startDate: new Date(fields.startDate),
            endDate: new Date(fields.endDate),
            registrationDeadline: fields.registrationDeadline
              ? new Date(fields.registrationDeadline)
              : null,
          };
          after = existing
            ? (
                await tx
                  .update(calendarEvent)
                  .set({
                    ...values,
                    version: sql`${calendarEvent.version} + 1`,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(calendarEvent.id, id),
                      eq(calendarEvent.version, existing.expectedVersion),
                    ),
                  )
                  .returning()
              )[0]
            : (
                await tx
                  .insert(calendarEvent)
                  .values({
                    ...values,
                    id,
                    sourceId: identity?.sourceId,
                    sourceHash: identity?.sourceHash,
                  })
                  .returning()
              )[0];
          await tx
            .delete(calendarEventCategory)
            .where(eq(calendarEventCategory.eventId, id));
          if (categoryIds.length)
            await tx
              .insert(calendarEventCategory)
              .values(
                categoryIds.map((categoryId) => ({ eventId: id, categoryId })),
              );
        }
        if (!after) throw new ContentConflictError();
        await audit.record({
          db: tx,
          actorId,
          actorType: "admin",
          action: existing ? "content.updated" : "content.created",
          targetType: entry.kind,
          targetId: id,
          beforeState: before
            ? {
                ...before,
                ...(beforeCategoryIds
                  ? { categoryIds: beforeCategoryIds }
                  : {}),
              }
            : undefined,
          afterState: {
            ...after,
            ...(entry.kind === "event"
              ? { categoryIds: entry.values.categoryIds }
              : {}),
          },
          details: { reason },
        });
        return { id, version: after.version };
      });
    },
    async remove(
      kind: ContentKind,
      id: string,
      expectedVersion: number,
      actorId: string,
      reason: string,
    ) {
      return db.transaction(async (tx) => {
        await lockCompetitionCatalog(tx);
        const table = kind === "resource" ? kbResource : calendarEvent;
        const before = (
          await tx.select().from(table).where(eq(table.id, id)).for("update")
        )[0];
        if (!before || before.version !== expectedVersion)
          throw new ContentConflictError();
        // Imported identities remain reserved so replay can never resurrect a deleted source record.
        if (before.sourceId)
          throw new ContentInvalidError(
            "Archive imported entries to preserve their source identity",
          );
        await tx
          .delete(table)
          .where(and(eq(table.id, id), eq(table.version, expectedVersion)));
        await audit.record({
          db: tx,
          actorId,
          actorType: "admin",
          action: "content.deleted",
          targetType: kind,
          targetId: id,
          beforeState: before,
          details: { reason },
        });
        return { id };
      });
    },
  };
}
export type ContentAdminRepo = ReturnType<typeof createContentAdminRepo>;
