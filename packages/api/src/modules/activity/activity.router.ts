import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { activityArticle } from "@cogito-app/db/schema";
import { db } from "../../lib/db";
import { adminProcedure, publicProcedure } from "../../procedures";
import { saveActivity } from "./activity.service";
import { saveActivityInput } from "./activity.types";
export const activityRouter = {
  admin: {
    list: adminProcedure.handler(() =>
      db.select().from(activityArticle).orderBy(desc(activityArticle.startAt)),
    ),
    save: adminProcedure.input(saveActivityInput).handler(async ({ input }) => {
      return saveActivity(db, input);
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
        imageUrl: r.coverUrl?.trim() || null,
        location: r.location,
        startAt: r.startAt.toISOString(),
        status: r.startAt.getTime() < Date.now() ? "completed" : "upcoming",
      }));
    }),
};
