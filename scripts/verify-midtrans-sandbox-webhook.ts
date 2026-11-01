/* eslint-disable no-await-in-loop -- Replay and scoped cleanup must be ordered. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";

const envFile = parse(readFileSync("apps/server/.env"));
const target = new URL(envFile.DATABASE_URL!);
assert.ok(
  ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.port === "6767" &&
    target.pathname === "/cogito-app" &&
    envFile.NODE_ENV === "development",
  "Expected localhost:6767/cogito-app development database",
);
assert.equal(envFile.PAYMENT_PROVIDER, "midtrans");
assert.equal(envFile.MIDTRANS_MODE, "test");
Object.assign(process.env, envFile, {
  RESEND_API_KEY: "",
  GOOGLE_MEET_ENABLED: "false",
});
if (!envFile.MIDTRANS_WEBHOOK_SIGNATURE_KEY)
  delete process.env.MIDTRANS_WEBHOOK_SIGNATURE_KEY;

const evidencePath = "tmp/v3-only-dev/midtrans-sandbox-acceptance.json";
interface AcceptanceEvidence {
  target: string;
  mode: string;
  runId: string;
  quote: { marks: number; amountIdr: number };
  purchase: { paymentId: string; quoteId: string };
  [key: string]: unknown;
}
const evidence = JSON.parse(
  readFileSync(evidencePath, "utf8"),
) as AcceptanceEvidence;
assert.equal(evidence.target, "localhost:6767/cogito-app");
assert.equal(evidence.mode, "Midtrans Sandbox");
const runId = String(evidence.runId);
assert.match(runId, /^[0-9a-f-]{36}$/i);
const userId = `midtrans-sandbox-${runId}`;
const paymentId = String(evidence.purchase?.paymentId);
const quoteId = String(evidence.purchase?.quoteId);
assert.match(paymentId, /^[0-9a-f-]{36}$/i);
assert.match(quoteId, /^[0-9a-f-]{36}$/i);

// DB must be imported before the Elysia routes (Bun import-order crash guard).
const { db } = await import("../packages/db/src");
const { eq, sql } = await import("../packages/db/node_modules/drizzle-orm");
const {
  booking,
  economyV3Activation,
  economyV3TopUpQuote,
  ledgerEntry,
  notification,
  paymentRecord,
  user,
  wallet,
  auditLog,
} = await import("../packages/db/src/schema");
const { services } = await import("../packages/api/src/services");
const { createServer } =
  await import("../apps/server/src/routes/create-server");

const sandboxApi = "https://api.sandbox.midtrans.com";
const auth = `Basic ${Buffer.from(`${envFile.MIDTRANS_SERVER_KEY}:`).toString("base64")}`;
const statusUrl = new URL(`/v2/${paymentId}/status`, sandboxApi);
assert.equal(statusUrl.origin, sandboxApi);
const statusResponse = await fetch(statusUrl, {
  headers: { authorization: auth, accept: "application/json" },
});
assert.equal(statusResponse.status, 200);
const providerStatus = (await statusResponse.json()) as Record<string, unknown>;
assert.equal(providerStatus.order_id, paymentId);
assert.equal(providerStatus.transaction_status, "capture");
assert.equal(providerStatus.fraud_status, "accept");
assert.equal(providerStatus.currency, "IDR");
assert.equal(Number(providerStatus.gross_amount), evidence.quote.amountIdr);

const [fixtureUser] = await db.select().from(user).where(eq(user.id, userId));
const [fixtureWallet] = await db
  .select()
  .from(wallet)
  .where(eq(wallet.userId, userId));
const [fixturePayment] = await db
  .select()
  .from(paymentRecord)
  .where(eq(paymentRecord.id, paymentId));
assert.ok(
  fixtureUser && fixtureWallet && fixturePayment,
  "Settled fixture must still exist",
);
assert.equal(fixturePayment.provider, "midtrans");
assert.equal(fixturePayment.quoteId, quoteId);
assert.equal(fixturePayment.status, "PENDING");
assert.equal(fixturePayment.marks, evidence.quote.marks);
const [database] = await db.execute(sql`select current_database() as name`);
assert.equal(database?.name, "cogito-app");

const beforeBookings = await db
  .select({ id: booking.id, priceSnapshot: booking.priceSnapshot })
  .from(booking);
const beforeActivation = await db
  .select({ activeRevision: economyV3Activation.activeRevision })
  .from(economyV3Activation)
  .where(eq(economyV3Activation.id, "default"));
const beforeWallet = fixtureWallet.totalBalance;
const statusCode = String(providerStatus.status_code);
const grossAmount = String(providerStatus.gross_amount);
const payload = {
  order_id: paymentId,
  status_code: statusCode,
  gross_amount: grossAmount,
  // Reuse Midtrans's own signature from its authenticated Sandbox status body.
  signature_key: providerStatus.signature_key,
  transaction_status: providerStatus.transaction_status,
  fraud_status: providerStatus.fraud_status,
  merchant_id: providerStatus.merchant_id,
  transaction_id: providerStatus.transaction_id,
  currency: providerStatus.currency,
  transaction_time: providerStatus.transaction_time,
  settlement_time: providerStatus.settlement_time,
};
const app = createServer();
const requestBody = JSON.stringify(payload);
async function deliverSignedStatus() {
  const response = await app.handle(
    new Request("http://localhost/webhooks/payments/midtrans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    }),
  );
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

let cleanupError: unknown;
try {
  const first = await deliverSignedStatus();
  assert.equal(
    first.status,
    200,
    `First signed webhook failed: ${JSON.stringify(first.body)}`,
  );
  const walletAfterFirst = await services.wallet.getOrCreate(userId);
  assert.equal(
    walletAfterFirst.totalBalance - beforeWallet,
    fixturePayment.marks,
  );
  const creditsAfterFirst = await db
    .select()
    .from(ledgerEntry)
    .where(eq(ledgerEntry.walletId, fixtureWallet.id));
  assert.equal(
    creditsAfterFirst.filter((entry) => entry.entryType === "credit").length,
    1,
  );

  const duplicate = await deliverSignedStatus();
  assert.equal(
    duplicate.status,
    200,
    `Duplicate signed webhook failed: ${JSON.stringify(duplicate.body)}`,
  );
  const walletAfterDuplicate = await services.wallet.getOrCreate(userId);
  assert.equal(
    walletAfterDuplicate.totalBalance - beforeWallet,
    fixturePayment.marks,
  );
  const creditsAfterDuplicate = await db
    .select()
    .from(ledgerEntry)
    .where(eq(ledgerEntry.walletId, fixtureWallet.id));
  assert.equal(
    creditsAfterDuplicate.filter((entry) => entry.entryType === "credit")
      .length,
    1,
  );
  const paidPayment = await services.payment.getPurchase(paymentId, userId);
  assert.equal(paidPayment.status, "PAID");

  evidence.providerStatusVerified = {
    status: providerStatus.transaction_status,
    fraud: providerStatus.fraud_status,
    currency: providerStatus.currency,
    amountIdr: Number(providerStatus.gross_amount),
    orderIdMatches: true,
  };
  evidence.webhookHandler = {
    proof:
      "in-process local route with the signature returned by authenticated Sandbox status",
    deliveries: [first, duplicate],
    walletCreditCount: 1,
    walletBalanceDelta: walletAfterDuplicate.totalBalance - beforeWallet,
    paymentStatus: paidPayment.status,
    externalWebhookDelivery: false,
  };
  delete evidence.webhookError;

  // Delete only the fresh UUID-scoped fixture after all financial evidence and
  // exact user/payment/quote guards are captured. The provider's Sandbox record
  // remains visible in Midtrans; it cannot be deleted after capture.
  assert.equal(
    (await db.select().from(user).where(eq(user.id, userId))).length,
    1,
  );
  assert.equal(
    (
      await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, paymentId))
    ).length,
    1,
  );
  assert.equal(
    (
      await db
        .select()
        .from(economyV3TopUpQuote)
        .where(eq(economyV3TopUpQuote.id, quoteId))
    ).length,
    1,
  );
  await db.delete(notification).where(eq(notification.userId, userId));
  await db.delete(auditLog).where(eq(auditLog.actorId, userId));
  await db.delete(paymentRecord).where(eq(paymentRecord.id, paymentId));
  await db
    .delete(economyV3TopUpQuote)
    .where(eq(economyV3TopUpQuote.id, quoteId));
  await db.delete(wallet).where(eq(wallet.userId, userId));
  await db.delete(user).where(eq(user.id, userId));
  evidence.cleanup =
    "own user/payment/quote/wallet/ledger/notifications removed after evidence; Midtrans Sandbox capture retained by provider";
} catch (error) {
  cleanupError = error;
  evidence.webhookError =
    error instanceof Error ? error.message : String(error);
  // Retain uncertain/settled financial fixtures for inspection.
  evidence.cleanup = "retained settled fixture due verification failure";
} finally {
  const afterBookings = await db
    .select({ id: booking.id, priceSnapshot: booking.priceSnapshot })
    .from(booking);
  const afterActivation = await db
    .select({ activeRevision: economyV3Activation.activeRevision })
    .from(economyV3Activation)
    .where(eq(economyV3Activation.id, "default"));
  assert.deepEqual(
    afterBookings,
    beforeBookings,
    "Existing booking rows changed",
  );
  assert.deepEqual(
    afterActivation,
    beforeActivation,
    "Active V3 pricing pointer changed",
  );
  evidence.existingBookingsUnchanged = true;
  evidence.pricingPointerUnchanged = true;
  evidence.cleanupError =
    cleanupError instanceof Error ? cleanupError.message : undefined;
  evidence.webhookVerifiedAt = new Date().toISOString();
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  await db.$client.end();
}

console.log(
  JSON.stringify({
    evidencePath,
    sandboxStatus: evidence.providerStatusVerified,
    webhook: evidence.webhookHandler,
    cleanup: evidence.cleanup,
    error: evidence.webhookError,
  }),
);
if (cleanupError) process.exitCode = 1;
