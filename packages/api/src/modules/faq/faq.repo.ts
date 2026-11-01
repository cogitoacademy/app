import { and, asc, eq, ne, sql } from "drizzle-orm";

import { faqEntry } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { TxClient } from "../../lib/tx";
import { FaqLandingLimitError } from "./faq.errors";
import { FAQ_LANDING_MAX_ITEMS } from "./faq.types";

async function lockFaqLandingSelection(tx: TxClient) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('cogito:faq-landing-selection', 0))`,
  );
}

export function createFaqRepo(db: DbType) {
  return {
    listAdmin() {
      return db
        .select()
        .from(faqEntry)
        .orderBy(
          asc(faqEntry.sortOrder),
          asc(faqEntry.createdAt),
          asc(faqEntry.id),
        );
    },

    listPublic(landingOnly: boolean) {
      return db
        .select({
          id: faqEntry.id,
          questionEn: faqEntry.questionEn,
          questionId: faqEntry.questionId,
          questionEnRich: faqEntry.questionEnRich,
          questionIdRich: faqEntry.questionIdRich,
          answerEn: faqEntry.answerEn,
          answerId: faqEntry.answerId,
          answerEnRich: faqEntry.answerEnRich,
          answerIdRich: faqEntry.answerIdRich,
          sortOrder: faqEntry.sortOrder,
        })
        .from(faqEntry)
        .where(
          landingOnly
            ? and(eq(faqEntry.isActive, true), eq(faqEntry.showOnLanding, true))
            : eq(faqEntry.isActive, true),
        )
        .orderBy(
          asc(faqEntry.sortOrder),
          asc(faqEntry.createdAt),
          asc(faqEntry.id),
        );
    },

    async create(values: typeof faqEntry.$inferInsert) {
      return db.transaction(async (tx) => {
        await lockFaqLandingSelection(tx);
        if (values.isActive && values.showOnLanding) {
          const selected = await tx
            .select({ id: faqEntry.id })
            .from(faqEntry)
            .where(
              and(
                eq(faqEntry.isActive, true),
                eq(faqEntry.showOnLanding, true),
              ),
            )
            .limit(FAQ_LANDING_MAX_ITEMS);
          if (selected.length >= FAQ_LANDING_MAX_ITEMS) {
            throw new FaqLandingLimitError();
          }
        }

        const [last] = await tx
          .select({
            next: sql<number>`coalesce(max(${faqEntry.sortOrder}), -1) + 1`,
          })
          .from(faqEntry);
        const [row] = await tx
          .insert(faqEntry)
          .values({ ...values, sortOrder: last?.next ?? 0 })
          .returning();
        if (!row) throw new Error("FAQ insert returned no row");
        return row;
      });
    },

    async updateIfVersion(
      id: string,
      expectedVersion: number,
      values: Partial<typeof faqEntry.$inferInsert>,
    ) {
      return db.transaction(async (tx) => {
        await lockFaqLandingSelection(tx);
        const [current] = await tx
          .select({
            version: faqEntry.version,
          })
          .from(faqEntry)
          .where(eq(faqEntry.id, id))
          .limit(1);
        if (!current || current.version !== expectedVersion) return undefined;

        if (values.isActive === true && values.showOnLanding === true) {
          const selected = await tx
            .select({ id: faqEntry.id })
            .from(faqEntry)
            .where(
              and(
                eq(faqEntry.isActive, true),
                eq(faqEntry.showOnLanding, true),
                ne(faqEntry.id, id),
              ),
            )
            .limit(FAQ_LANDING_MAX_ITEMS);
          if (selected.length >= FAQ_LANDING_MAX_ITEMS) {
            throw new FaqLandingLimitError();
          }
        }

        const [row] = await tx
          .update(faqEntry)
          .set({
            ...values,
            version: sql`${faqEntry.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(eq(faqEntry.id, id), eq(faqEntry.version, expectedVersion)),
          )
          .returning();
        return row;
      });
    },

    async reorder(ids: string[]) {
      return db.transaction(async (tx) => {
        await lockFaqLandingSelection(tx);
        for (const [sortOrder, id] of ids.entries()) {
          await tx
            .update(faqEntry)
            .set({ sortOrder })
            .where(eq(faqEntry.id, id));
        }
      });
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
