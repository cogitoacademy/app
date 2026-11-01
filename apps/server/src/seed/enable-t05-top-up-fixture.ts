import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { economyV3Activation, user } from "@cogito-app/db/schema";
import { createEconomyService } from "@cogito-app/api/modules/economy/economy.service";
import { DEFAULT_V3_ECONOMY_CONFIG } from "@cogito-app/api/modules/pricing/v3-economy.config";

function assertT05TestDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.T05_ENROLLMENT_TEST_DB_PORT !== "6769" ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !loopback.has(databaseUrl.hostname.toLowerCase()) ||
    databaseUrl.port !== "6769" ||
    databaseUrl.pathname !== "/cogito-test"
  ) {
    throw new Error(
      "The T05 top-up fixture may only write to loopback cogito-test on port 6769.",
    );
  }
}

async function enableT05TopUpFixture() {
  assertT05TestDatabase();
  const economy = createEconomyService({ db });
  if (await economy.getActiveV3Config()) return;

  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1);
  if (!admin) throw new Error("The T05 top-up fixture requires a seeded admin");

  const current = await economy.getV3Config();
  const revision = await economy.saveV3Config(db, {
    expectedVersion: current.version,
    values: DEFAULT_V3_ECONOMY_CONFIG,
    reason: "T05 isolated E2E quoted top-up fixture",
    createdBy: admin.id,
  });
  if (!revision) throw new Error("The T05 top-up fixture revision conflicted");

  await db
    .insert(economyV3Activation)
    .values({
      id: "default",
      activeRevision: revision.version,
      updatedBy: admin.id,
    })
    .onConflictDoUpdate({
      target: economyV3Activation.id,
      set: {
        activeRevision: revision.version,
        updatedBy: admin.id,
        updatedAt: new Date(),
      },
    });
  console.log(
    "Enabled the synthetic V3 top-up quote fixture on T05 cogito-test.",
  );
}

try {
  await enableT05TopUpFixture();
} finally {
  await db.$client.end();
}
