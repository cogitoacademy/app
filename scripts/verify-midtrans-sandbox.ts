/* eslint-disable no-await-in-loop -- This journey is deliberately ordered and finally-cleaned. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";

const parsed = parse(readFileSync("apps/server/.env"));
const target = new URL(parsed.DATABASE_URL!);
assert.ok(
  ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.port === "6767" &&
    target.pathname === "/cogito-app" &&
    parsed.NODE_ENV === "development",
  "Expected localhost:6767/cogito-app development database",
);
assert.equal(parsed.PAYMENT_PROVIDER, "midtrans");
assert.equal(parsed.MIDTRANS_MODE, "test");
assert.ok(parsed.MIDTRANS_SERVER_KEY, "Midtrans Server Key is required");

Object.assign(process.env, parsed, {
  // These purchases must never send an email or create unrelated integrations.
  RESEND_API_KEY: "",
  GOOGLE_MEET_ENABLED: "false",
});

const { db } = await import("../packages/db/src");
const { eq, sql } = await import("../packages/db/node_modules/drizzle-orm");
const {
  auditLog,
  booking,
  economyV3Activation,
  economyV3TopUpQuote,
  notification,
  paymentRecord,
  user,
  wallet,
} = await import("../packages/db/src/schema");
const { services } = await import("../packages/api/src/services");
const { chromium } =
  await import("../packages/e2e/node_modules/@playwright/test");

const sandboxApi = "https://api.sandbox.midtrans.com";
const runId = crypto.randomUUID();
const userId = `midtrans-sandbox-${runId}`;
const email = `midtrans-sandbox-${runId}@example.invalid`;
const evidencePath = "tmp/v3-only-dev/midtrans-sandbox-acceptance.json";
const evidence: Record<string, unknown> = {
  target: "localhost:6767/cogito-app",
  mode: "Midtrans Sandbox",
  testedAt: new Date().toISOString(),
  runId,
};
let fixtureCreated = false;
let quoteId: string | undefined;
let paymentId: string | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

const auth = `Basic ${Buffer.from(`${parsed.MIDTRANS_SERVER_KEY}:`).toString("base64")}`;
const beforeBookings = await db
  .select({ id: booking.id, priceSnapshot: booking.priceSnapshot })
  .from(booking);
const beforeActivation = await db
  .select({ activeRevision: economyV3Activation.activeRevision })
  .from(economyV3Activation)
  .where(eq(economyV3Activation.id, "default"));
let cleanupError: unknown;

async function providerStatus(orderId: string) {
  const url = new URL(`/v2/${encodeURIComponent(orderId)}/status`, sandboxApi);
  assert.equal(
    url.origin,
    sandboxApi,
    "Provider status must remain Sandbox-only",
  );
  const response = await fetch(url, {
    headers: { authorization: auth, accept: "application/json" },
  });
  if (response.status === 404) return null;
  assert.equal(
    response.status,
    200,
    `Sandbox status request returned ${response.status}`,
  );
  return (await response.json()) as Record<string, unknown>;
}

const sandboxProbe = await fetch(
  new URL(
    `/v2/midtrans-readonly-probe-${crypto.randomUUID()}/status`,
    sandboxApi,
  ),
  { headers: { authorization: auth, accept: "application/json" } },
);
assert.equal(sandboxProbe.status, 200);
const sandboxProbeBody = (await sandboxProbe.json()) as Record<string, unknown>;
assert.match(
  String(sandboxProbeBody.status_message ?? ""),
  /transaction (?:does not|doesn't) exist/i,
  "Configured key must authenticate against Sandbox and return transaction-not-found",
);

async function expirePendingSandboxOrder(orderId: string) {
  const remote = await providerStatus(orderId);
  if (!remote || remote.transaction_status !== "pending") return remote;
  const url = new URL(`/v2/${encodeURIComponent(orderId)}/expire`, sandboxApi);
  assert.equal(
    url.origin,
    sandboxApi,
    "Provider expiry must remain Sandbox-only",
  );
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: auth, accept: "application/json" },
  });
  assert.ok(response.ok, `Sandbox expiry returned ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

mkdirSync("tmp/v3-only-dev", { recursive: true });
try {
  const [database] = await db.execute(sql`select current_database() as name`);
  assert.equal(database?.name, "cogito-app");
  assert.equal(
    (await db.select({ id: user.id }).from(user).where(eq(user.id, userId)))
      .length,
    0,
  );
  assert.ok(
    (await services.payment.getTopUpCatalog()).active,
    "V3 pricing must be active",
  );

  await db.insert(user).values({
    id: userId,
    name: "Sandbox Acceptance Fixture",
    email,
    emailVerified: true,
    role: "student",
  });
  fixtureCreated = true;
  const walletRow = await services.wallet.getOrCreate(userId);
  const catalog = await services.payment.getTopUpCatalog();
  const smallestPackage = [...catalog.packages].sort(
    (a, b) => a.marks - b.marks,
  )[0];
  assert.ok(smallestPackage, "Active V3 catalog needs a package");
  const quote = await services.payment.createTopUpQuote(userId, {
    requestKey: runId,
    marks: smallestPackage.marks,
  });
  quoteId = quote.quoteId;
  assert.equal(quote.revision, catalog.revision);
  assert.ok(Date.parse(quote.expiresAt) - Date.now() <= 900_000);
  assert.equal(quote.exactPackage?.code, smallestPackage.code);

  const purchase = await services.payment.createPurchaseFromTopUpQuote(
    userId,
    walletRow.id,
    quote.quoteId,
    "package",
  );
  paymentId = purchase.paymentId;
  assert.equal(purchase.status, "PENDING");
  assert.ok(purchase.checkoutUrl);
  assert.equal(
    new URL(purchase.checkoutUrl!).hostname,
    "app.sandbox.midtrans.com",
  );
  evidence.quote = {
    revision: quote.revision,
    marks: quote.marks,
    amountIdr: quote.exactPackage?.priceIdr,
    ttlSeconds: 900,
  };
  evidence.purchase = {
    paymentId,
    quoteId,
    initialStatus: purchase.status,
    checkoutHost: new URL(purchase.checkoutUrl!).hostname,
  };

  const remotePending = await providerStatus(paymentId);
  evidence.initialProviderStatus =
    remotePending?.transaction_status ?? "not-found";
  evidence.initialProviderDetails = remotePending
    ? Object.fromEntries(
        [
          "status_code",
          "status_message",
          "transaction_status",
          "order_id",
          "currency",
          "gross_amount",
        ]
          .filter((key) => key in remotePending)
          .map((key) => [key, remotePending[key]]),
      )
    : "HTTP 404";

  // Inspect the actual hosted checkout in an isolated Edge context. No browser
  // profile, saved payment method, real card, or user contact data is used.
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(purchase.checkoutUrl!, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert.equal(new URL(page.url()).hostname, "app.sandbox.midtrans.com");
  await page.screenshot({
    path: "tmp/v3-only-dev/midtrans-sandbox-checkout.png",
    fullPage: true,
  });
  const checkoutText = (await page.locator("body").innerText()).slice(0, 3000);
  await page.getByText("Card Payment", { exact: true }).last().click();
  await page.waitForTimeout(1500);
  assert.equal(new URL(page.url()).hostname, "app.sandbox.midtrans.com");
  const cardStepText = (await page.locator("body").innerText()).slice(0, 3000);
  const fields = await page.locator("input").evaluateAll((nodes) =>
    nodes.map((node) => {
      const input = node as HTMLInputElement;
      return {
        type: input.type,
        name: input.name,
        placeholder: input.placeholder,
        autocomplete: input.autocomplete,
        ariaLabel: input.getAttribute("aria-label"),
      };
    }),
  );
  await page
    .locator('input[autocomplete="cc-number"]')
    .fill("4811111111111114");
  await page.locator('input[autocomplete="cc-exp"]').fill("01/30");
  await page.locator('input[autocomplete="cc-csc"]').fill("123");
  await page.getByText("Pay now", { exact: true }).click();
  await page.waitForTimeout(2500);
  const paymentHost = new URL(page.url()).hostname;
  assert.ok(
    ["app.sandbox.midtrans.com", "simulator.sandbox.midtrans.com"].includes(
      paymentHost,
    ),
    `Sandbox checkout redirected to unexpected host ${paymentHost}`,
  );
  const nextStepText = (await page.locator("body").innerText()).slice(0, 3000);
  const nextStepFields = await page.locator("input").evaluateAll((nodes) =>
    nodes.map((node) => {
      const input = node as HTMLInputElement;
      return {
        type: input.type,
        name: input.name,
        placeholder: input.placeholder,
        autocomplete: input.autocomplete,
      };
    }),
  );
  evidence.checkoutPage = {
    title: await page.title(),
    hostname: new URL(page.url()).hostname,
    text: checkoutText,
    cardStepText,
    fields,
    nextStepText,
    nextStepFields,
    paymentHost,
  };
  console.log(
    JSON.stringify({
      checkoutHost: new URL(page.url()).hostname,
      providerStatus: evidence.initialProviderStatus,
      providerDetails: evidence.initialProviderDetails,
      checkoutTitle:
        evidence.checkoutPage &&
        (evidence.checkoutPage as Record<string, unknown>).title,
      checkoutText,
      cardStepText,
      fields,
      nextStepText,
      nextStepFields,
      paymentHost,
    }),
  );
  await context.close();
  await browser.close();
  browser = undefined;
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (paymentId) {
    try {
      const remote = await expirePendingSandboxOrder(paymentId);
      if (remote) {
        evidence.finalProviderStatus = String(
          remote.transaction_status ?? "unknown",
        );
        if (
          remote.transaction_status === "settlement" ||
          remote.transaction_status === "capture"
        ) {
          evidence.cleanup =
            "retained settled fixture for signed webhook verification";
        }
      }
    } catch (error) {
      cleanupError = error;
    }
  }
  if (fixtureCreated && !cleanupError) {
    try {
      await db.delete(notification).where(eq(notification.userId, userId));
      await db.delete(auditLog).where(eq(auditLog.actorId, userId));
      if (paymentId)
        await db.delete(paymentRecord).where(eq(paymentRecord.id, paymentId));
      if (quoteId)
        await db
          .delete(economyV3TopUpQuote)
          .where(eq(economyV3TopUpQuote.id, quoteId));
      await db.delete(wallet).where(eq(wallet.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
      evidence.cleanup =
        "temporary user, wallet, quote, payment, ledger and notifications removed";
    } catch (error) {
      cleanupError = error;
    }
  }
  evidence.completedAt = new Date().toISOString();
  evidence.cleanupError =
    cleanupError instanceof Error ? cleanupError.message : undefined;
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
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      evidencePath,
      mode: evidence.mode,
      target: evidence.target,
      checkoutHost: (evidence.purchase as Record<string, unknown> | undefined)
        ?.checkoutHost,
      providerStatus:
        evidence.finalProviderStatus ?? evidence.initialProviderStatus,
      cleanup: evidence.cleanup,
      error: evidence.error,
      cleanupError: evidence.cleanupError,
    }),
  );
}

await db.$client.end();
if (cleanupError) process.exitCode = 1;
