import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import { activityArticle } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { z } from "zod";
import { saveActivityInput } from "./activity.types";

export async function saveActivity(
  db: DbType,
  input: z.infer<typeof saveActivityInput>,
) {
  const { id, expectedVersion, ...fields } = input;
  const values = {
    ...fields,
    startAt: new Date(fields.startAt),
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
}
