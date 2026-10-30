import { expect, test, type Page } from "@playwright/test";

// Synthetic snapshot: keep the layout harness independent of API/DB imports.
const DEFAULT_V3_ECONOMY_CONFIG = {
  packages: [
    { code: "starter", marks: 50, priceIdr: 350_000 },
    { code: "learner", marks: 150, priceIdr: 975_000 },
    { code: "explorer", marks: 250, priceIdr: 1_500_000 },
    { code: "pioneer", marks: 500, priceIdr: 2_750_000 },
  ],
  exactSurchargeIdr: 250,
  competitionRates: {
    "competition-model-united-nations": { soloMarks: 50, soloFeeIdr: 200_000 },
    "competition-world-scholars-cup": { soloMarks: 50, soloFeeIdr: 200_000 },
    "competition-debate": { soloMarks: 44, soloFeeIdr: 180_000 },
    "competition-olympiad": { soloMarks: 44, soloFeeIdr: 180_000 },
    "competition-essay-writing": { soloMarks: 38, soloFeeIdr: 160_000 },
    "competition-business": { soloMarks: 38, soloFeeIdr: 160_000 },
    "competition-public-speaking": { soloMarks: 38, soloFeeIdr: 160_000 },
  },
  onlineAdditionalMarks: 12,
  onlineAdditionalFeeIdr: 30_000,
  offlineBaseAdditionalMarks: 22,
  offlineAdditionalMarks: 20,
  offlineBaseAdditionalFeeIdr: 75_000,
  offlineAdditionalFeeIdr: 50_000,
};

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

async function mockFinance(page: Page, activation = false) {
  let activeRevision = activation ? null : 1;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://localhost:3357") {
      if (url.origin === "http://localhost:3356") return route.continue();
      errors.push(`Unexpected origin: ${url.origin}`);
      return route.abort();
    }
    const procedure = new URL(route.request().url()).pathname;
    if (
      /\/(save|record|prepare|void|resolve|update|setTutor)/.test(procedure)
    ) {
      errors.push(`Unexpected write: ${procedure}`);
      return route.abort();
    }
    const user = {
      id: "finance-admin",
      name: "Finance Admin",
      email: "finance@example.test",
      role: "admin",
      emailVerified: true,
      image: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (procedure.includes("/api/auth/"))
      return route.fulfill({
        json: {
          user,
          session: {
            id: "synthetic",
            userId: user.id,
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      });
    let data: unknown = [];
    if (procedure.endsWith("getV3EconomySettings"))
      data = {
        version: 1,
        activeRevision,
        values: DEFAULT_V3_ECONOMY_CONFIG,
        competitions: Object.entries(
          DEFAULT_V3_ECONOMY_CONFIG.competitionRates,
        ).map(([slug, rate]) => ({
          id: slug,
          slug,
          name: slug.replace("competition-", ""),
          rate,
          rateConfigured: true,
        })),
      };
    else if (activation && procedure.endsWith("activateV3EconomySettings")) {
      expect(route.request().postDataJSON().json).toEqual({ version: 1, expectedActiveRevision: null, reason: "Approved new pricing" });
      activeRevision = 1;
      data = { activeRevision };
    }
    else if (procedure.endsWith("getTutorPayoutReport"))
      data = payoutRows().map((row, index) =>
        index === 1
          ? {
              ...row,
              status: "prepared",
              tutorName: "Prepared Tutor",
              actualReference: "REFERENCE".repeat(30),
            }
          : row,
      );
    else if (procedure.endsWith("getTutorTaxConfig"))
      data = {
        id: "default",
        version: 1,
        nikNpwpRateBps: 250,
        nikOnlyRateBps: 300,
        missingRateBps: 300,
      };
    else if (procedure.endsWith("getTutorPayoutAllocations"))
      data = { items: allocationItems };
    else if (procedure.endsWith("previewTutorPayout"))
      data = {
        previewVersion: "c".repeat(64),
        tutorId: "tutor-fixture",
        profileVersion: 1,
        taxConfigVersion: 1,
        sourceKeys: allocationItems.map((item) => item.sourceKey),
        items: allocationItems,
        grossHonorariumIdr: 300000,
        taxStatus: "nik_npwp",
        taxRateBps: 250,
        taxRateSource: "default_nik_npwp",
        taxHonorariumIdr: 7500,
        transferFeeIdr: 0,
        netHonorariumIdr: 292500,
        legalName: "Synthetic Tutor",
        nik: "0012345678901234",
        npwp: "000123456789000",
        bankName: "BCA",
        bankAccountNumber: "001234567890",
        bankAccountHolderName: "Synthetic Tutor",
      };
    else if (procedure.endsWith("getPendingTutorPayouts"))
      data = {
        items: allocationItems,
        completedSessions: 2,
        tutorPayoutIdr: 300000,
        lastPaidAt: null,
      };
    else if (procedure.includes("notification/"))
      data = { items: [], count: 0 };
    return route.fulfill({ json: { json: data, meta: [] } });
  });
  return errors;
}

async function measure(page: Page, name: string) {
  const issues = await page.evaluate(() => {
    const failures: string[] = [];
    const dialog = document.querySelector('[data-slot="drawer-popup"]');
    const root = dialog ?? document.querySelector("main") ?? document.body;
    for (const element of root.querySelectorAll<HTMLElement>(
      '[data-slot="card"], [data-slot="field"], [data-slot="number-field-group"], [data-slot="table-container"], section, button, [data-slot="drawer-body"]',
    )) {
      if (
        !element.getClientRects().length ||
        (element.closest('[data-slot="table-container"]') &&
          !element.matches('[data-slot="table-container"]'))
      )
        continue;
      const r = element.getBoundingClientRect();
      if (
        r.right > innerWidth + 1 ||
        r.left < -1 ||
        (!element.matches('[data-slot="table-container"]') &&
          element.scrollWidth > element.clientWidth + 1)
      )
        failures.push(
          `${element.dataset.slot ?? element.tagName}:${element.textContent?.trim().slice(0, 35)} bounds=${Math.round(r.left)}..${Math.round(r.right)} scroll/client=${element.scrollWidth}/${element.clientWidth}`,
        );
      if (
        element.tagName === "BUTTON" &&
        element.scrollHeight > element.clientHeight + 1
      )
        failures.push(
          `button height ${element.scrollHeight}/${element.clientHeight}: ${element.textContent}`,
        );
    }
    for (const input of root.querySelectorAll<HTMLInputElement>(
      '[data-slot="number-field-input"]',
    )) {
      const c = document.createElement("canvas").getContext("2d")!;
      const style = getComputedStyle(input);
      c.font = style.font;
      const available =
        input.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      if (c.measureText(input.value).width > available + 1)
        failures.push(
          `numeric ${input.getAttribute("aria-label") ?? input.id}: ${input.value} needs ${c.measureText(input.value).width.toFixed(1)} available ${available}`,
        );
    }
    return failures;
  });
  console.log(name, JSON.stringify(issues));
  console.log(
    name,
    "geometry",
    await page
      .locator('[data-slot="table-container"]')
      .evaluateAll((elements) =>
        elements.map((el) => ({
          client: el.clientWidth,
          scroll: el.scrollWidth,
        })),
      ),
  );
  await page.screenshot({
    path: `test-results/finance-layout/${name}.png`,
    fullPage: true,
  });
  expect(issues).toEqual([]);
}

for (const width of [320, 390, 768, 1440]) {
  test(`economy ${width}`, async ({ page }) => {
    const errors = await mockFinance(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin-economy");
    await expect(
      page.getByRole("heading", { name: "V3 rate card", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await measure(page, `economy-readonly-${width}`);
    await page
      .getByRole("button", { name: "Edit V3 draft", exact: true })
      .click();
    const amount = page.getByRole("textbox", {
      name: "starter price in IDR",
      exact: true,
    });
    await amount.click();
    await amount.press("ControlOrMeta+A");
    await amount.pressSequentially("2000000000");
    await page.keyboard.press("Tab");
    await expect(amount).toHaveValue("2000000000");
    await amount.scrollIntoViewIfNeeded();
    console.log(
      "price text width",
      await amount.evaluate((el) => el.clientWidth - 20),
    );
    await measure(page, `economy-${width}`);
    expect(errors).toEqual([]);
  });
  test(`payout ${width}`, async ({ page }) => {
    const errors = await mockFinance(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin-tutor-payouts");
    await expect(
      page.getByRole("button", { name: "Details", exact: true }).first(),
    ).toBeVisible();
    await measure(page, `payout-${width}`);
    const table = page.locator('[data-slot="table-container"]');
    expect(
      await table.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
        return el.scrollLeft;
      }),
    ).toBeGreaterThan(0);
    await page
      .getByRole("combobox")
      .filter({ hasText: "Unpaid sessions" })
      .click();
    await page
      .getByRole("option", { name: "All statuses", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Details", exact: true })
      .nth(1)
      .click();
    await expect(
      page.getByRole("button", {
        name: "Record transfer as paid",
        exact: true,
      }),
    ).toBeAttached();
    await expect
      .poll(() =>
        page
          .locator('[data-slot="drawer-popup"]')
          .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
      )
      .toBe(width);
    await measure(page, `payout-drawer-${width}`);
    await page
      .getByLabel("Void reason", { exact: true })
      .fill("Synthetic review only");
    await page.getByLabel("Void reason", { exact: true }).press("Tab");
    await expect(
      page.getByRole("button", { name: "Void with audit record", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Void with audit record", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `test-results/finance-layout/payout-actions-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Details", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await expect(
      page.getByText("Versioned payout preview", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('[data-slot="drawer-popup"]')
          .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
      )
      .toBe(width);
    await measure(page, `payout-preview-${width}`);
    await page
      .getByRole("button", { name: "Prepare selected batch", exact: true })
      .focus();
    await expect(
      page.getByRole("button", { name: "Prepare selected batch", exact: true }),
    ).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Details", exact: true })
      .nth(2)
      .click();
    await expect
      .poll(() =>
        page
          .locator('[data-slot="drawer-popup"]')
          .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
      )
      .toBe(width);
    await measure(page, `payout-void-${width}`);
    await page
      .getByLabel("Resolution details", { exact: true })
      .fill("Synthetic review only");
    await page.getByLabel("Resolution details", { exact: true }).press("Tab");
    await expect(
      page.getByRole("button", { name: "Resolve reconciliation", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("economy activation requires reason and refreshes active badge", async ({ page }) => {
  const errors = await mockFinance(page, true);
  await page.goto("/admin-economy");
  await expect(page.getByText("Draft · not active", { exact: true })).toBeVisible();
  const button = page.getByRole("button", { name: "Activate saved pricing", exact: true });
  await expect(button).toBeDisabled();
  await page.getByLabel("Reason for activating pricing", { exact: true }).fill("Approved new pricing");
  await button.click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(button).toHaveCount(0);
  expect(errors).toEqual([]);
});
