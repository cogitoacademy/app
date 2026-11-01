import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { economyV3Activation } from "@cogito-app/db/schema";
import { DEFAULT_V3_ECONOMY_CONFIG } from "../../modules/pricing/v3-economy.config";
import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

describe("dynamic competition rate configuration", () => {
  let admin: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    await resetDatabase();
    const account = await signUpAndSignIn(
      "v3.dynamic.admin@cogito.test",
      "Test1234!",
      "V3 Dynamic Admin",
    );
    const context = await createTestContext(account.cookie);
    const adminId = context.session!.user.id;
    await setUserRole(adminId, "admin");
    admin = createTestClient(await createTestContext(account.cookie));
  });

  test("lists a new parent without a rate, then saves it in a draft revision", async () => {
    const slug = `competition-dynamic-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const parent = await admin.admin.createCompetitionParent({
      slug,
      name: "Dynamic Test Competition",
      lightTextColor: "oklch(0.16 0.02 250)",
      lightBackgroundColor: "oklch(0.82 0.08 220)",
      darkTextColor: "oklch(0.97 0 0)",
      darkBackgroundColor: "oklch(0.28 0.05 255)",
      reason: "Verify a new competition can receive a draft rate",
    });

    const initial = await admin.admin.getV3EconomySettings();
    expect(
      initial.competitions.find((entry) => entry.slug === slug),
    ).toMatchObject({
      id: parent.id,
      rateConfigured: false,
      rate: null,
    });

    const values = structuredClone(initial.values);
    values.competitionRates[slug] = { soloMarks: 41, soloFeeIdr: 123_000 };
    const revision = await admin.admin.saveV3EconomySettings({
      expectedVersion: initial.version,
      values,
      reason: "Add a test rate for the new parent",
    });

    expect(revision).toMatchObject({
      status: "draft",
      values: {
        competitionRates: { [slug]: { soloMarks: 41, soloFeeIdr: 123_000 } },
      },
    });
    const updated = await admin.admin.getV3EconomySettings();
    expect(
      updated.competitions.find((entry) => entry.slug === slug),
    ).toMatchObject({
      rateConfigured: true,
      rate: { soloMarks: 41, soloFeeIdr: 123_000 },
    });
    const [activation] = await db
      .select({ activeRevision: economyV3Activation.activeRevision })
      .from(economyV3Activation)
      .where(eq(economyV3Activation.id, "default"));
    expect(activation?.activeRevision ?? null).toBe(1);
    expect(revision.values.competitionRates).toMatchObject(
      DEFAULT_V3_ECONOMY_CONFIG.competitionRates,
    );
  });
});
