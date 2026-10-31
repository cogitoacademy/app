/* eslint-disable no-await-in-loop -- Acceptance and cleanup preserve transactional ordering. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";

const env = parse(readFileSync("apps/server/.env"));
const target = new URL(env.DATABASE_URL!);
assert.ok(
  ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.port === "6767" &&
    target.pathname === "/cogito-app" &&
    env.NODE_ENV === "development",
  "Expected localhost:6767/cogito-app development database",
);
Object.assign(process.env, env, {
  GOOGLE_MEET_ENABLED: "false",
  PAYMENT_PROVIDER: "stub",
  RESEND_API_KEY: "",
});
const { db } = await import("../packages/db/src");
const { eq, and, sql, inArray } =
  await import("../packages/db/node_modules/drizzle-orm");
const {
  user,
  booking,
  economyV3Activation,
  economyV3Revision,
  economyV3TopUpQuote,
  auditLog,
} = await import("../packages/db/src/schema");
const { services } = await import("../packages/api/src/services");
const runId = crypto.randomUUID();
const reason = `Temporary pricing activation acceptance ${runId}`;
const requestKeys = [crypto.randomUUID(), crypto.randomUUID()];
const result: Record<string, unknown> = {
  target: "localhost:6767/cogito-app",
  testedAt: new Date().toISOString(),
  runId,
};
const [originalPointer] = await db
  .select()
  .from(economyV3Activation)
  .where(eq(economyV3Activation.id, "default"));
assert.ok(
  originalPointer?.activeRevision,
  "An existing active dev revision is required",
);
const [admin] = await db
  .select()
  .from(user)
  .where(eq(user.role, "admin"))
  .limit(1);
const [student] = await db
  .select()
  .from(user)
  .where(eq(user.role, "student"))
  .limit(1);
assert.ok(admin && student, "Seeded admin and student required");
let createdVersion: number | null = null;
mkdirSync("tmp/v3-only-dev", { recursive: true });
try {
  const [database] = await db.execute(sql`select current_database() as name`);
  assert.equal(database?.name, "cogito-app");
  const oldActive = await services.pricing.getActiveV3Config();
  assert.ok(oldActive);
  const existingBookings = (
    await db
      .select({ id: booking.id, priceSnapshot: booking.priceSnapshot })
      .from(booking)
  ).filter((row) => row.priceSnapshot?.engine === "v3");
  assert.ok(existingBookings.length > 0, "Existing pinned V3 booking required");
  const oldQuote = await services.payment.createTopUpQuote(student.id, {
    requestKey: requestKeys[0]!,
    marks: 140,
  });
  assert.equal(oldQuote.revision, oldActive.version);
  const settings = await services.admin.getV3EconomySettings();
  const changed = structuredClone(oldActive.values);
  changed.exactSurchargeIdr += 1;
  for (const rate of Object.values(changed.competitionRates))
    rate.soloMarks += 1;
  const saved = await services.admin.saveV3EconomySettings(admin.id, {
    expectedVersion: settings.version,
    values: changed,
    reason,
  });
  createdVersion = saved.version;
  assert.equal(
    (await services.pricing.getActiveV3Config())!.version,
    oldActive.version,
  );
  const activation = await services.admin.activateV3EconomySettings(admin.id, {
    version: saved.version,
    expectedActiveRevision: oldActive.version,
    reason,
  });
  assert.equal(activation.activeRevision, saved.version);
  const active = await services.pricing.getActiveV3Config();
  assert.equal(active!.version, saved.version);
  assert.deepEqual(active!.values, changed);
  const newQuote = await services.payment.createTopUpQuote(student.id, {
    requestKey: requestKeys[1]!,
    marks: 140,
  });
  assert.equal(newQuote.revision, saved.version);
  assert.equal(newQuote.customAmountIdr, oldQuote.customAmountIdr! + 140);
  const replay = await services.payment.createTopUpQuote(student.id, {
    requestKey: requestKeys[0]!,
    marks: 140,
  });
  assert.deepEqual(replay, oldQuote);
  for (const before of existingBookings) {
    const [after] = await db
      .select({ priceSnapshot: booking.priceSnapshot })
      .from(booking)
      .where(eq(booking.id, before.id));
    assert.deepEqual(after!.priceSnapshot, before.priceSnapshot);
    const snapshot = before.priceSnapshot as unknown as { v3Revision: number };
    const pinned = await services.pricing.getV3ConfigByVersion(
      snapshot.v3Revision,
    );
    assert.ok(pinned);
    if (snapshot.v3Revision === oldActive.version)
      assert.deepEqual(pinned.values, oldActive.values);
  }
  await assert.rejects(
    () =>
      services.admin.activateV3EconomySettings(admin.id, {
        version: saved.version,
        expectedActiveRevision: oldActive.version,
        reason,
      }),
    /changed|conflict|version/i,
  );
  const activationAudits = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "economy_v3_revision_activated"),
        eq(auditLog.targetId, String(saved.version)),
      ),
    );
  assert.equal(activationAudits.length, 1);
  assert.deepEqual(activationAudits[0]!.beforeState, {
    activeRevision: oldActive.version,
  });
  assert.deepEqual(activationAudits[0]!.afterState, {
    activeRevision: saved.version,
  });
  assert.equal(activationAudits[0]!.details?.reason, reason);
  result.checks = {
    savedRevision: saved.version,
    originalRevision: oldActive.version,
    saveDidNotActivate: true,
    activationAudited: true,
    staleActivationRejected: true,
    oldQuoteUnchanged: true,
    oldQuoteAmountIdr: oldQuote.customAmountIdr,
    newQuoteAmountIdr: newQuote.customAmountIdr,
    pinnedBookingSnapshotsUnchanged: existingBookings.length,
    pinnedRevisionReadable: true,
  };
  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error = error instanceof Error ? error.message : "Verification failed";
} finally {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('economy-v3-revision', 0))`,
      );
      const [pointer] = await tx
        .select()
        .from(economyV3Activation)
        .where(eq(economyV3Activation.id, "default"));
      if (pointer?.activeRevision !== originalPointer.activeRevision) {
        assert.equal(
          pointer?.activeRevision,
          createdVersion,
          "Active pointer changed outside this test; refusing to overwrite it",
        );
        await tx
          .update(economyV3Activation)
          .set({
            activeRevision: originalPointer.activeRevision,
            updatedBy: originalPointer.updatedBy,
            updatedAt: originalPointer.updatedAt,
          })
          .where(eq(economyV3Activation.id, "default"));
      }
    });
    // Restore pricing even if a later fixture deletion is blocked by a foreign key.
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('economy-v3-revision', 0))`,
      );
      await tx
        .delete(economyV3TopUpQuote)
        .where(
          and(
            eq(economyV3TopUpQuote.userId, student.id),
            inArray(economyV3TopUpQuote.requestKey, requestKeys),
          ),
        );
      const ownRevisions = await tx
        .select()
        .from(economyV3Revision)
        .where(
          and(
            eq(economyV3Revision.createdBy, admin.id),
            eq(economyV3Revision.reason, reason),
          ),
        );
      for (const revision of ownRevisions) {
        await tx
          .delete(auditLog)
          .where(
            and(
              eq(auditLog.targetType, "economy_v3_revision"),
              eq(auditLog.targetId, String(revision.version)),
              sql`${auditLog.details}->>'reason' = ${reason}`,
            ),
          );
        await tx
          .delete(economyV3Revision)
          .where(eq(economyV3Revision.version, revision.version));
      }
    });
    const [restored] = await db
      .select()
      .from(economyV3Activation)
      .where(eq(economyV3Activation.id, "default"));
    assert.deepEqual(restored, originalPointer);
    assert.equal(
      (
        await db
          .select()
          .from(economyV3TopUpQuote)
          .where(inArray(economyV3TopUpQuote.requestKey, requestKeys))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(economyV3Revision)
          .where(eq(economyV3Revision.reason, reason))
      ).length,
      0,
    );
    result.cleanup =
      "Original activation pointer and metadata restored; temporary quotes, revision and audits removed";
  } catch (error) {
    result.ok = false;
    result.cleanup = error instanceof Error ? error.message : "Cleanup failed";
  }
  writeFileSync(
    "tmp/v3-only-dev/pricing-activation-live.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
}
process.exit(result.ok ? 0 : 1);
