import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  auditLog,
  economyV3Revision,
  economyV3Activation,
  subjectCategory,
} from "@cogito-app/db/schema";

import { db } from "@cogito-app/db";
import { services } from "../../services";
import { DEFAULT_V3_ECONOMY_CONFIG } from "../../modules/pricing/v3-economy.config";
import { createAdminService } from "../../modules/admin/admin.service";
import { createEconomyService } from "../../modules/economy/economy.service";
import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

describe("Economy settings role safety", () => {
  let adminClient: ReturnType<typeof createTestClient>;
  let tutorClient: ReturnType<typeof createTestClient>;
  let studentClient: ReturnType<typeof createTestClient>;
  let adminId: string;

  beforeAll(async () => {
    await resetDatabase();

    const admin = await signUpAndSignIn(
      "economy.admin@cogito.test",
      "Test1234!",
      "Economy Admin",
    );
    const adminContext = await createTestContext(admin.cookie);
    await setUserRole(adminContext.session!.user.id, "admin");
    adminId = adminContext.session!.user.id;
    adminClient = createTestClient(await createTestContext(admin.cookie));

    const tutor = await signUpAndSignIn(
      "economy.tutor@cogito.test",
      "Test1234!",
      "Economy Tutor",
    );
    const tutorContext = await createTestContext(tutor.cookie);
    await setUserRole(tutorContext.session!.user.id, "tutor");
    tutorClient = createTestClient(await createTestContext(tutor.cookie));

    const student = await signUpAndSignIn(
      "economy.student@cogito.test",
      "Test1234!",
      "Economy Student",
    );
    studentClient = createTestClient(await createTestContext(student.cookie));
    for (const slug of Object.keys(
      DEFAULT_V3_ECONOMY_CONFIG.competitionRates,
    )) {
      const existing = await db.query.subjectCategory.findFirst({
        where: eq(subjectCategory.slug, slug),
      });
      if (existing) continue;
      await services.competitionCatalog.createParent(adminId, {
        slug,
        name: slug,
        reason: "V3 economy role fixtures",
        lightTextColor: "oklch(1 0 0)",
        lightBackgroundColor: "oklch(0.5 0.1 250)",
        darkTextColor: "oklch(1 0 0)",
        darkBackgroundColor: "oklch(0.5 0.1 250)",
      });
    }
  });

  test("V3 concurrent saves create one immutable revision and audit", async () => {
    const [activeBefore] = await db.select().from(economyV3Activation);
    const initial = await adminClient.admin.getV3EconomySettings();
    expect(initial.version).toBe(1);
    const first = structuredClone(DEFAULT_V3_ECONOMY_CONFIG);
    const second = structuredClone(DEFAULT_V3_ECONOMY_CONFIG);
    second.competitionRates["competition-debate"].soloMarks = 46;
    const outcomes = await Promise.allSettled([
      adminClient.admin.saveV3EconomySettings({
        expectedVersion: 1,
        reason: "First admin rates",
        values: first,
      }),
      adminClient.admin.saveV3EconomySettings({
        expectedVersion: 1,
        reason: "Concurrent admin rates",
        values: second,
      }),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const [revisionOne] = await db
      .select()
      .from(economyV3Revision)
      .where(eq(economyV3Revision.version, 2));
    expect(revisionOne).toBeDefined();
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "economy_v3_revision_created"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorId).toBe(adminId);
    await adminClient.admin.saveV3EconomySettings({
      expectedVersion: 2,
      reason: "Second revision",
      values: first,
    });
    const [preserved] = await db
      .select()
      .from(economyV3Revision)
      .where(eq(economyV3Revision.version, 2));
    expect(preserved).toEqual(revisionOne);
    expect((await adminClient.admin.getV3EconomySettings()).version).toBe(3);
    const [activeAfter] = await db.select().from(economyV3Activation);
    expect(activeAfter).toEqual(activeBefore);
  });

  test("V3 audit failure rolls back the new revision in Postgres", async () => {
    const service = createAdminService({
      db,
      economy: createEconomyService({ db }),
      competitionCatalog: services.competitionCatalog,
      auditPort: {
        record: async () => {
          throw new Error("forced audit failure");
        },
      },
    } as Parameters<typeof createAdminService>[0]);
    await expect(
      service.saveV3EconomySettings(adminId, {
        expectedVersion: 3,
        reason: "Must roll back",
        values: DEFAULT_V3_ECONOMY_CONFIG,
      }),
    ).rejects.toThrow("forced audit failure");
    expect(
      await db
        .select()
        .from(economyV3Revision)
        .where(eq(economyV3Revision.version, 4)),
    ).toHaveLength(0);
    expect((await adminClient.admin.getV3EconomySettings()).version).toBe(3);
  });

  test("stale V3 saves are rejected", async () => {
    await expect(
      adminClient.admin.saveV3EconomySettings({
        expectedVersion: 0,
        values: DEFAULT_V3_ECONOMY_CONFIG,
        reason: "Stale save",
      }),
    ).rejects.toThrow();
  });

  test("student and tutor cannot read or mutate V3 admin settings", async () => {
    for (const client of [studentClient, tutorClient]) {
      await expect(client.admin.getV3EconomySettings()).rejects.toThrow();
      await expect(
        client.admin.saveV3EconomySettings({
          expectedVersion: 3,
          values: DEFAULT_V3_ECONOMY_CONFIG,
          reason: "Unauthorized save",
        }),
      ).rejects.toThrow();
    }
  });
});
