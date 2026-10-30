import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { activityArticle } from "@cogito-app/db/schema";
import { db } from "../../lib/db";
import { adminProcedure, publicProcedure } from "../../procedures";
import { saveActivityInput } from "./activity.types";
export const activityRouter = {
  admin: {
    list: adminProcedure.handler(() =>
      db.select().from(activityArticle).orderBy(desc(activityArticle.startAt)),
    ),
    save: adminProcedure.input(saveActivityInput).handler(async ({ input }) => {
      const { id, expectedVersion, ...fields } = input;
      const values = {
        ...fields,
        startAt: new Date(fields.startAt),
        endAt: new Date(fields.endAt),
        updatedAt: new Date(),
      };
      if (id) {
        const [row] = await db
          .update(activityArticle)
          .set({ ...values, version: sql`${activityArticle.version}+1` })
          .where(
            and(
              eq(activityArticle.id, id),
              eq(activityArticle.version, expectedVersion!),
            ),
          )
          .returning();
        if (!row)
          throw new ORPCError("CONFLICT", {
            message: "Article changed. Reload before saving.",
          });
        return row;
      }
      const [row] = await db
        .insert(activityArticle)
        .values({ ...values, id: crypto.randomUUID() })
        .returning();
      return row;
    }),
    remove: adminProcedure
      .input(
        z.object({
          id: z.string(),
          expectedVersion: z.number().int().positive(),
        }),
      )
      .handler(async ({ input }) => {
        const rows = await db
          .delete(activityArticle)
          .where(
            and(
              eq(activityArticle.id, input.id),
              eq(activityArticle.version, input.expectedVersion),
            ),
          )
          .returning({ id: activityArticle.id });
        if (!rows.length) throw new ORPCError("CONFLICT");
        return { success: true };
      }),
  },
  list: publicProcedure
    .input(z.object({ locale: z.enum(["en", "id"]).default("en") }))
    .handler(async ({ input }) => {
      const rows = await db
        .select()
        .from(activityArticle)
        .where(eq(activityArticle.state, "published"))
        .orderBy(desc(activityArticle.startAt));
      return rows.map((r) => ({
        id: r.id,
        title:
          input.locale === "id" && r.titleId?.trim() ? r.titleId : r.titleEn,
        description:
          input.locale === "id" && r.descriptionId?.trim()
            ? r.descriptionId
            : r.descriptionEn,
        body: input.locale === "id" && r.bodyId ? r.bodyId : r.bodyEn,
        imageUrl: r.coverUrl,
        location: r.location,
        startAt: r.startAt.toISOString(),
        endAt: r.endAt.toISOString(),
        status: r.endAt.getTime() < Date.now() ? "completed" : "upcoming",
      }));
    }),
};
