import { afterEach, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";

import { db } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";
import { USER_ROLE } from "@cogito-app/api/shared/constants";

import { ensureConfiguredProductionAdmins } from "./admin-bootstrap";

const insertedUserIds: string[] = [];

afterEach(async () => {
  if (insertedUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, insertedUserIds));
    insertedUserIds.length = 0;
  }
});

describe("production admin bootstrap", () => {
  test("does nothing outside production-like environments", async () => {
    await expect(
      ensureConfiguredProductionAdmins({
        nodeEnv: "test",
        configuredEmails: "admin@example.com",
      }),
    ).resolves.toEqual({ skipped: true, matched: 0, promoted: 0 });
  });

  test("promotes configured users case-insensitively without demoting admins", async () => {
    const suffix = crypto.randomUUID();
    const candidateId = crypto.randomUUID();
    const existingAdminId = crypto.randomUUID();
    const untouchedId = crypto.randomUUID();
    insertedUserIds.push(candidateId, existingAdminId, untouchedId);

    const candidateEmail = `AdminCandidate.${suffix}@cogito.test`;
    const existingAdminEmail = `ExistingAdmin.${suffix}@cogito.test`;
    await db.insert(user).values([
      {
        id: candidateId,
        name: "Admin candidate",
        email: candidateEmail,
        role: USER_ROLE.STUDENT,
      },
      {
        id: existingAdminId,
        name: "Existing admin",
        email: existingAdminEmail,
        role: USER_ROLE.ADMIN,
      },
      {
        id: untouchedId,
        name: "Untouched tutor",
        email: `tutor.${suffix}@cogito.test`,
        role: USER_ROLE.TUTOR,
      },
    ]);

    const result = await ensureConfiguredProductionAdmins({
      nodeEnv: "production",
      configuredEmails: `${candidateEmail.toUpperCase()}, ${existingAdminEmail}`,
    });

    expect(result).toEqual({ skipped: false, matched: 2, promoted: 1 });

    const rows = await db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(inArray(user.id, insertedUserIds));
    expect(new Map(rows.map((row) => [row.id, row.role]))).toEqual(
      new Map([
        [candidateId, USER_ROLE.ADMIN],
        [existingAdminId, USER_ROLE.ADMIN],
        [untouchedId, USER_ROLE.TUTOR],
      ]),
    );
  });
});
