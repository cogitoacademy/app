import { and, eq, sql } from "drizzle-orm";
import { subjectCategory } from "@cogito-app/db/schema";

import type { TxClient } from "../../lib/tx";

/** Requires an active transaction so the lock survives through its writes. */
export async function lockCompetitionCatalog(tx: TxClient): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('cogito:competition-catalog'))`,
  );
}

/** Returns whether this active leaf is selectable under the requested parent. */
export async function isSelectableCompetitionRef(
  tx: TxClient,
  competitionId: string,
  specializationId: string,
): Promise<boolean> {
  const specialization = await tx.query.subjectCategory.findFirst({
    where: and(
      eq(subjectCategory.id, specializationId),
      eq(subjectCategory.parentId, competitionId),
      eq(subjectCategory.isActive, true),
    ),
    with: { parent: true },
  });

  return Boolean(
    specialization?.parent &&
    specialization.parent.parentId === null &&
    specialization.parent.isActive,
  );
}
