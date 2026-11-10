import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { user, auditLog } from "@cogito-app/db/schema";
import { ORPCError } from "@orpc/server";

export const manualSignupSourceInput = z.object({
  userId: z.string().min(1),
  source: z.enum(["whatsapp", "school", "event", "friend", "other"]),
});
export async function setManualSignupSource(
  actorId: string,
  input: z.infer<typeof manualSignupSourceInput>,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ signupSource: user.signupSource })
      .from(user)
      .where(eq(user.id, input.userId))
      .for("update");
    if (!row) throw new ORPCError("NOT_FOUND");
    const value = { ...row.signupSource, manual: input.source };
    await tx
      .update(user)
      .set({ signupSource: value })
      .where(eq(user.id, input.userId));
    await tx.insert(auditLog).values({
      actorId,
      actorType: "admin",
      action: "signup_source.manual_updated",
      targetId: input.userId,
      targetType: "user",
      afterState: { manual: input.source },
    });
    return { manual: input.source };
  });
}
