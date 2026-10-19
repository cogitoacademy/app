import { and, asc, eq, sql } from "drizzle-orm";

import { faqEntry } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";

export function createFaqRepo(db: DbType) {
  return {
    listAdmin() {
      return db
        .select()
        .from(faqEntry)
        .orderBy(asc(faqEntry.sortOrder), asc(faqEntry.id));
    },

    listPublic(landingOnly: boolean) {
      return db
        .select({
          id: faqEntry.id,
          questionEn: faqEntry.questionEn,
          questionId: faqEntry.questionId,
          answerEn: faqEntry.answerEn,
          answerId: faqEntry.answerId,
          sortOrder: faqEntry.sortOrder,
        })
        .from(faqEntry)
        .where(
          landingOnly
            ? and(eq(faqEntry.isActive, true), eq(faqEntry.showOnLanding, true))
            : eq(faqEntry.isActive, true),
        )
        .orderBy(asc(faqEntry.sortOrder), asc(faqEntry.id));
    },

    async create(values: typeof faqEntry.$inferInsert) {
      const [row] = await db.insert(faqEntry).values(values).returning();
      if (!row) throw new Error("FAQ insert returned no row");
      return row;
    },

    async updateIfVersion(
      id: string,
      expectedVersion: number,
      values: Partial<typeof faqEntry.$inferInsert>,
    ) {
      const [row] = await db
        .update(faqEntry)
        .set({
          ...values,
          version: sql`${faqEntry.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(faqEntry.id, id), eq(faqEntry.version, expectedVersion)))
        .returning();
      return row;
    },

    async findById(id: string) {
      const [row] = await db
        .select()
        .from(faqEntry)
        .where(eq(faqEntry.id, id))
        .limit(1);
      return row;
    },
  };
}

export type FaqRepo = ReturnType<typeof createFaqRepo>;
export type FaqRow = Awaited<ReturnType<FaqRepo["listAdmin"]>>[number];
