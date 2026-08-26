import { inArray, or, sql } from "drizzle-orm";

import { USER_ROLE } from "@cogito-app/api/shared/constants";
import { db } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";
import { parseConfiguredAdminEmails } from "@cogito-app/env/admin";
import { isProductionLike } from "@cogito-app/env/node-env";
import { env } from "@cogito-app/env/server";

export type AdminBootstrapResult = {
  skipped: boolean;
  matched: number;
  promoted: number;
};

/**
 * Promotes configured operator accounts without demoting existing admins.
 *
 * This is intentionally a reconciliation step rather than a user-creation
 * step: production seed creates the initial account when required, while boot
 * handles an account that already exists as a student and the auth hook
 * handles a first-time signup after boot.
 */
export async function ensureConfiguredProductionAdmins(options?: {
  nodeEnv?: string;
  configuredEmails?: string;
}): Promise<AdminBootstrapResult> {
  const nodeEnv = options?.nodeEnv ?? env.NODE_ENV;
  if (!isProductionLike(nodeEnv)) {
    return { skipped: true, matched: 0, promoted: 0 };
  }

  const emails = parseConfiguredAdminEmails(
    options?.configuredEmails ?? env.ADMIN_EMAILS,
  );
  const emailPredicate = or(
    ...emails.map((email) => sql`lower(${user.email}) = ${email}`),
  );

  if (!emailPredicate) {
    return { skipped: false, matched: 0, promoted: 0 };
  }

  const matches = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(emailPredicate);
  const idsToPromote = matches
    .filter((candidate) => candidate.role !== USER_ROLE.ADMIN)
    .map((candidate) => candidate.id);

  if (idsToPromote.length > 0) {
    await db
      .update(user)
      .set({ role: USER_ROLE.ADMIN })
      .where(inArray(user.id, idsToPromote));
    console.info(
      JSON.stringify({
        level: "info",
        action: "production_admin_bootstrap",
        matched: matches.length,
        promoted: idsToPromote.length,
      }),
    );
  }

  return {
    skipped: false,
    matched: matches.length,
    promoted: idsToPromote.length,
  };
}
