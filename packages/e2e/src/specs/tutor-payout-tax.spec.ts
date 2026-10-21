import { readFile } from "node:fs/promises";
import {
  expect,
  request,
  test,
  type Browser,
  type Page,
} from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TUTOR_EMAIL,
  TUTOR_PASSWORD,
} from "../fixtures/test-accounts";

const serverUrl = process.env.SERVER_URL ?? "http://localhost:3101";

function assertPayoutTestDatabase() {
  let databaseUrl: URL | undefined;
  try {
    if (process.env.DATABASE_URL) {
      databaseUrl = new URL(process.env.DATABASE_URL);
    }
  } catch {
    databaseUrl = undefined;
  }

  if (
    process.env.NODE_ENV !== "test" ||
    (databaseUrl?.protocol !== "postgres:" &&
      databaseUrl?.protocol !== "postgresql:") ||
    !["localhost", "127.0.0.1", "::1"].includes(
      databaseUrl?.hostname.toLowerCase().replace(/^\[|\]$/g, "") ?? "",
    ) ||
    databaseUrl?.port !== "6770" ||
    databaseUrl?.pathname !== "/cogito-test-payout"
  ) {
    throw new Error(
      "Tutor payout browser coverage requires NODE_ENV=test and loopback cogito-test-payout on port 6770.",
    );
  }
}

async function createAuthenticatedPage(
  browser: Browser,
  email: string,
  password: string,
) {
  const api = await request.newContext({ baseURL: serverUrl });
  const signIn = await api.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  if (!signIn.ok()) {
    await api.dispose();
    throw new Error(`Payout E2E sign-in returned ${signIn.status()}`);
  }

  const context = await browser.newContext({
    storageState: await api.storageState(),
  });
  await api.dispose();
  return { context, page: await context.newPage() };
}

async function fulfillJson(page: Page, pattern: string, value: unknown) {
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ json: value, meta: [] }),
    }),
  );
}

const allocationItems = [
  {
    sourceKey: "fee-event-1",
    sourceType: "fee_event",
    tutorSessionFeeId: "fee-id-1",
    bookingId: "booking-id-1",
    bookingNumber: 201,
    bookingSessionId: null,
    bookingType: "solo",
    deliveryStatus: "completed",
    scheduledStartAt: "2026-10-20T03:00:00.000Z",
    earnedAt: "2026-10-20T04:00:00.000Z",
    grossHonorariumIdr: 100_000,
    priceSnapshot: null,
  },
  {
    sourceKey: "fee-event-2",
    sourceType: "fee_event",
    tutorSessionFeeId: "fee-id-2",
    bookingId: "booking-id-2",
    bookingNumber: 202,
    bookingSessionId: null,
    bookingType: "solo",
    deliveryStatus: "completed",
    scheduledStartAt: "2026-10-21T03:00:00.000Z",
    earnedAt: "2026-10-21T04:00:00.000Z",
    grossHonorariumIdr: 200_000,
    priceSnapshot: null,
  },
];

const payoutRows = () => {
  const now = new Date().toISOString();
  return [
    {
      id: "pending:tutor-fixture",
      tutorId: "tutor-fixture",
      tutorName: "T3 Payout Tutor",
      bankName: "BCA",
      bankAccountNumber: "001234567890",
      bankAccountHolderName: "T3 Payout Tutor",
      bankAccountOpeningCity: "Jakarta",
      bankAccountOwnership: "self",
      taxLegalName: "T3 Tutor Legal Name",
      taxNik: "0012345678901234",
      taxNpwp: "000123456789000",
      grossHonorariumIdr: 300_000,
      transferFeeIdr: 0,
      netHonorariumIdr: 292_500,
      status: "pending",
      paidAt: null,
      payoutAccountComplete: true,
      taxProfileComplete: true,
      taxStatus: "nik_npwp",
      taxRateBps: 250,
      taxRateSource: "default_nik_npwp",
      taxHonorariumIdr: 7_500,
      actualAmountIdr: null,
      actualReference: null,
      actualProofUrl: null,
      transferRecordedAt: null,
      transferRecordedBy: null,
      preparedAt: null,
      voidedAt: null,
      voidReason: null,
      reconciliationStatus: "not_required",
      reconciliationReason: null,
      previewVersion: null,
      coveredSessionCount: 2,
    },
    {
      id: "paid-fixture",
      tutorId: "tutor-paid-fixture",
      tutorName: '=HYPERLINK("https://example.invalid")',
      bankName: "Mandiri",
      bankAccountNumber: "000000123456",
      bankAccountHolderName: "Paid Tutor",
      bankAccountOpeningCity: "Jakarta",
      bankAccountOwnership: "self",
      taxLegalName: "Paid Tutor Legal Name",
      taxNik: "0000000000000001",
      taxNpwp: "000123456789000",
      grossHonorariumIdr: 100_000,
      transferFeeIdr: 2_500,
      netHonorariumIdr: 94_500,
      status: "paid",
      paidAt: now,
      payoutAccountComplete: true,
      taxProfileComplete: true,
      taxStatus: "nik_only",
      taxRateBps: 300,
      taxRateSource: "default_nik_only",
      taxHonorariumIdr: 3_000,
      actualAmountIdr: 94_500,
      actualReference: "BANK-CSV-001",
      actualProofUrl: null,
      transferRecordedAt: now,
      transferRecordedBy: "admin-fixture",
      preparedAt: now,
      voidedAt: null,
      voidReason: null,
      reconciliationStatus: "not_required",
      reconciliationReason: null,
      previewVersion: "a".repeat(64),
      coveredSessionCount: 1,
    },
    {
      id: "void-fixture",
      tutorId: "tutor-void-fixture",
      tutorName: "Void Tutor",
      bankName: "Mandiri",
      bankAccountNumber: "000000654321",
      bankAccountHolderName: "Void Tutor",
      bankAccountOpeningCity: "Jakarta",
      bankAccountOwnership: "self",
      taxLegalName: "Void Tutor Legal Name",
      taxNik: "0000000000000002",
      taxNpwp: null,
      grossHonorariumIdr: 200_000,
      transferFeeIdr: 2_500,
      netHonorariumIdr: 191_500,
      status: "void",
      paidAt: now,
      payoutAccountComplete: true,
      taxProfileComplete: true,
      taxStatus: "nik_only",
      taxRateBps: 300,
      taxRateSource: "default_nik_only",
      taxHonorariumIdr: 6_000,
      actualAmountIdr: 191_500,
      actualReference: "BANK-VOID-001",
      actualProofUrl: null,
      transferRecordedAt: now,
      transferRecordedBy: "admin-fixture",
      preparedAt: now,
      voidedAt: now,
      voidReason: "Fixture reconciliation",
      reconciliationStatus: "required",
      reconciliationReason: null,
      previewVersion: "b".repeat(64),
      coveredSessionCount: 1,
    },
  ];
};

test("tutor dashboard shows the payout breakdown without tax identity values", async ({
  browser,
}) => {
  assertPayoutTestDatabase();
  const session = await createAuthenticatedPage(
    browser,
    TUTOR_EMAIL,
    TUTOR_PASSWORD,
  );
  try {
    await fulfillJson(session.page, "**/rpc/tutor/getMyPayoutFinance", {
      pending: {
        completedSessions: 3,
        grossHonorariumIdr: 1_000_000,
        taxStatus: "nik_npwp",
        taxRateBps: 250,
        taxRateSource: "default_nik_npwp",
        taxHonorariumIdr: 25_000,
        transferFeeIdr: 2_500,
        netHonorariumIdr: 972_500,
        payoutAccountComplete: true,
        taxProfileComplete: true,
        items: [],
      },
      history: [
        {
          id: "own-payout",
          status: "paid",
          grossHonorariumIdr: 500_000,
          taxStatus: "nik_only",
          taxRateBps: 300,
          taxRateSource: "default_nik_only",
          taxHonorariumIdr: 15_000,
          transferFeeIdr: 2_500,
          netHonorariumIdr: 482_500,
          actualAmountIdr: 482_500,
          paidAt: new Date().toISOString(),
          actualReference: "BANK-OWN-001",
          reconciliationStatus: "not_required",
          items: [
            {
              sourceKey: "own-source-1",
              bookingNumber: 201,
              bookingType: "solo",
              scheduledStartAt: "2026-10-20T03:00:00.000Z",
            },
            {
              sourceKey: "own-source-2",
              bookingNumber: 202,
              bookingType: "series",
              scheduledStartAt: "2026-10-21T03:00:00.000Z",
            },
          ],
        },
      ],
    });
    await session.page.goto("/dashboard");

    await expect(
      session.page.getByRole("heading", { name: "Payout details" }),
    ).toBeVisible();
    await expect(session.page.getByText("Unpaid sessions")).toBeVisible();
    await expect(
      session.page.getByText("3", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      session.page.getByText("2.50%", { exact: true }),
    ).toBeVisible();
    await expect(session.page.getByText("Rp1.000.000")).toBeVisible();
    await expect(session.page.getByText("Rp25.000")).toBeVisible();
    await expect(session.page.getByText("Rp2.500").first()).toBeVisible();
    await expect(session.page.getByText("Rp972.500")).toBeVisible();
    await expect(
      session.page.getByText(/gross Rp500\.000 · tax 3\.00%/),
    ).toBeVisible();
    await expect(
      session.page.getByText("Booking #201 · solo · 20 Oct 2026"),
    ).toBeVisible();
    await expect(
      session.page.getByText("Booking #202 · series · 21 Oct 2026"),
    ).toBeVisible();
    await expect(
      session.page.getByText("0012345678901234", { exact: false }),
    ).toHaveCount(0);
    await expect(
      session.page.getByText("000123456789000", { exact: false }),
    ).toHaveCount(0);
  } finally {
    await session.context.close();
  }
});

test("admin reviews the selected snapshot and exports paid/void CSV rows", async ({
  browser,
}) => {
  assertPayoutTestDatabase();
  const session = await createAuthenticatedPage(
    browser,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
  );
  try {
    await fulfillJson(
      session.page,
      "**/rpc/admin/getTutorPayoutReport",
      payoutRows(),
    );
    await fulfillJson(session.page, "**/rpc/admin/getTutorTaxConfig", {
      id: "default",
      version: 0,
      nikNpwpRateBps: 250,
      nikOnlyRateBps: 300,
      missingRateBps: 300,
    });
    await fulfillJson(session.page, "**/rpc/admin/getPendingTutorPayouts", {
      completedSessions: 2,
      totalMarks: 300,
      cogitoTake: 0,
      tutorPayout: 300,
      tutorPayoutIdr: 300_000,
      items: allocationItems,
      lastPaidAt: null,
    });
    await session.page.route(
      "**/rpc/admin/previewTutorPayout",
      async (route) => {
        const requestBody = route.request().postDataJSON() as {
          json: { sourceKeys: string[] };
        };
        const items = allocationItems.filter((item) =>
          requestBody.json.sourceKeys.includes(item.sourceKey),
        );
        const gross = items.reduce(
          (sum, item) => sum + item.grossHonorariumIdr,
          0,
        );
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              previewVersion: "c".repeat(64),
              tutorId: "tutor-fixture",
              profileVersion: 1,
              taxConfigVersion: 0,
              sourceKeys: items.map((item) => item.sourceKey),
              items,
              grossHonorariumIdr: gross,
              taxStatus: "nik_npwp",
              taxRateBps: 250,
              taxRateSource: "default_nik_npwp",
              taxHonorariumIdr: 7_500,
              transferFeeIdr: 0,
              netHonorariumIdr: 292_500,
              legalName: "T3 Tutor Legal Name",
              nik: "0012345678901234",
              npwp: "000123456789000",
              bankName: "BCA",
              bankAccountNumber: "001234567890",
              bankAccountHolderName: "T3 Payout Tutor",
            },
            meta: [],
          }),
        });
      },
    );

    await session.page.goto("/admin-tutor-payouts");
    await expect(
      session.page.getByRole("heading", { name: "Tutor payouts" }),
    ).toBeVisible();

    const downloadPromise = session.page.waitForEvent("download");
    await session.page
      .getByRole("button", { name: "Download monthly CSV" })
      .click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const csv = await readFile(downloadPath!, "utf8");
    expect(csv).toContain("Tax rate snapshot (basis points)");
    expect(csv).toContain("BANK-CSV-001");
    expect(csv).toContain("Void and reconciliation records");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'000000123456");

    await session.page
      .getByRole("button", { name: "Details", exact: true })
      .click();
    await session.page.getByRole("button", { name: "Select all" }).click();
    await expect(
      session.page.getByText("Versioned payout preview"),
    ).toBeVisible();
    await expect(session.page.getByText("Rp292.500").last()).toBeVisible();
    await expect(
      session.page.getByText("Account number", { exact: true }).last(),
    ).toBeVisible();
    await expect(
      session.page.getByRole("button", { name: "Prepare selected batch" }),
    ).toBeEnabled();
  } finally {
    await session.context.close();
  }
});

test("admin prepares a payout, rejects a mismatch, records the exact transfer, and gates repayment after void", async ({
  browser,
}) => {
  assertPayoutTestDatabase();
  const session = await createAuthenticatedPage(
    browser,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
  );
  try {
    const payoutId = "c1381c71-2fd2-4d7a-8bc3-14045f605a88";
    const previewVersion = "d".repeat(64);
    const pendingRow = payoutRows()[0]!;
    let status: "pending" | "prepared" | "paid" | "void" = "pending";
    let actualAmountIdr: number | null = null;
    let actualPaidAt: string | null = null;
    let actualReference: string | null = null;
    let voidReason: string | null = null;
    let recordTransferCalls = 0;

    const payoutRow = () => ({
      ...pendingRow,
      id: payoutId,
      status,
      paidAt: status === "paid" || status === "void" ? actualPaidAt : null,
      previewVersion: status === "pending" ? null : previewVersion,
      preparedAt: status === "pending" ? null : new Date().toISOString(),
      actualAmountIdr,
      actualReference,
      actualProofUrl: null,
      transferRecordedAt: actualPaidAt,
      transferRecordedBy:
        status === "paid" || status === "void" ? "admin-fixture" : null,
      voidedAt: status === "void" ? new Date().toISOString() : null,
      voidReason,
      reconciliationStatus: status === "void" ? "required" : "not_required",
      reconciliationReason: null,
    });

    await session.page.route(
      "**/rpc/admin/getTutorPayoutReport",
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: [payoutRow()], meta: [] }),
        }),
    );
    await fulfillJson(session.page, "**/rpc/admin/getTutorTaxConfig", {
      id: "default",
      version: 0,
      nikNpwpRateBps: 250,
      nikOnlyRateBps: 300,
      missingRateBps: 300,
    });
    await fulfillJson(session.page, "**/rpc/admin/getPendingTutorPayouts", {
      completedSessions: 2,
      totalMarks: 300,
      cogitoTake: 0,
      tutorPayout: 300,
      tutorPayoutIdr: 300_000,
      items: allocationItems,
      lastPaidAt: null,
    });
    await session.page.route(
      "**/rpc/admin/getTutorPayoutAllocations",
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: { payoutId, items: allocationItems },
            meta: [],
          }),
        }),
    );
    await session.page.route("**/rpc/admin/previewTutorPayout", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: {
            previewVersion,
            tutorId: "tutor-fixture",
            profileVersion: 1,
            taxConfigVersion: 0,
            sourceKeys: allocationItems.map((item) => item.sourceKey),
            items: allocationItems,
            grossHonorariumIdr: 300_000,
            taxStatus: "nik_npwp",
            taxRateBps: 250,
            taxRateSource: "default_nik_npwp",
            taxHonorariumIdr: 7_500,
            transferFeeIdr: 0,
            netHonorariumIdr: 292_500,
            legalName: "T3 Tutor Legal Name",
            nik: "0012345678901234",
            npwp: "000123456789000",
            bankName: "BCA",
            bankAccountNumber: "001234567890",
            bankAccountHolderName: "T3 Payout Tutor",
          },
          meta: [],
        }),
      }),
    );
    await session.page.route(
      "**/rpc/admin/prepareTutorPayout",
      async (route) => {
        status = "prepared";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: { payoutId, status }, meta: [] }),
        });
      },
    );
    await session.page.route(
      "**/rpc/admin/recordTutorPayoutTransfer",
      async (route) => {
        recordTransferCalls += 1;
        const body = route.request().postDataJSON() as {
          json: { actualAmountIdr: number; paidAt: string; reference?: string };
        };
        actualAmountIdr = body.json.actualAmountIdr;
        actualPaidAt = body.json.paidAt;
        actualReference = body.json.reference ?? null;
        status = "paid";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: { payoutId, status }, meta: [] }),
        });
      },
    );
    await session.page.route("**/rpc/admin/voidTutorPayout", async (route) => {
      const body = route.request().postDataJSON() as {
        json: { reason: string };
      };
      voidReason = body.json.reason;
      status = "void";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: { payoutId, status }, meta: [] }),
      });
    });

    await session.page.goto("/admin-tutor-payouts");
    await session.page
      .getByRole("button", { name: "Details", exact: true })
      .click();
    await session.page.getByRole("button", { name: "Select all" }).click();
    await expect(
      session.page.getByText("Versioned payout preview"),
    ).toBeVisible();
    await session.page
      .getByRole("button", { name: "Prepare selected batch" })
      .click();
    await expect(session.page.getByText("Payout prepared")).toBeVisible();

    const statusSelect = session.page.getByRole("combobox").first();
    await statusSelect.click();
    await session.page.getByRole("option", { name: "Prepared" }).click();
    await session.page
      .getByRole("button", { name: "Details", exact: true })
      .click();
    await session.page.getByLabel("Actual amount (IDR)").fill("292499");
    await session.page
      .getByRole("button", { name: "Record transfer as paid" })
      .click();
    await expect(
      session.page.getByText("Transfer amount does not match"),
    ).toBeVisible();
    expect(recordTransferCalls).toBe(0);

    await session.page.getByLabel("Actual amount (IDR)").fill("292500");
    await session.page
      .getByLabel("Transfer reference (optional)")
      .fill("BANK-UI-001");
    await session.page
      .getByRole("button", { name: "Record transfer as paid" })
      .click();
    await expect(
      session.page.getByText("External transfer recorded"),
    ).toBeVisible();
    expect(recordTransferCalls).toBe(1);

    await statusSelect.click();
    await session.page
      .getByRole("option", { name: "Recorded transfer" })
      .click();
    await session.page
      .getByRole("button", { name: "Details", exact: true })
      .click();
    await expect(session.page.getByText("BANK-UI-001")).toBeVisible();
    await session.page
      .getByLabel("Void reason")
      .fill("Duplicate bank transfer correction");
    await session.page
      .getByRole("button", { name: "Void with audit record" })
      .click();
    await expect(session.page.getByText("Payout voided")).toBeVisible();

    await statusSelect.click();
    await session.page
      .getByRole("option", { name: "Void / reconcile" })
      .click();
    await expect(
      session.page.getByText("External transfer must be reconciled", {
        exact: true,
      }),
    ).toBeVisible();
    await session.page
      .getByRole("button", { name: "Details", exact: true })
      .click();
    await expect(
      session.page.getByText("External transfer reconciliation required"),
    ).toBeVisible();
    await expect(session.page.getByText("BANK-UI-001")).toBeVisible();
    await expect(
      session.page.getByRole("button", { name: "Resolve reconciliation" }),
    ).toBeDisabled();
  } finally {
    await session.context.close();
  }
});
