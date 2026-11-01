import { expect, test, type Page, type Request } from "@playwright/test";
import { readFile } from "node:fs/promises";
const apiOrigin = `http://localhost:${process.env.KOL_API_PORT ?? "3307"}`;
// Synthetic wire/render checks do not prove DB accounting, replay or authorization.
const decision = {
  id: "decision-1",
  campaignName: "Synthetic KOL",
  code: "KOL",
  referredUserName: "Student",
  referredUserEmail: "student@example.test",
  paymentId: "payment-1",
  paymentReference: "ORDER-1",
  paymentStatus: "PAID",
  paymentStatusSnapshot: "PAID",
  providerSuccessTimeState: "resolved",
  providerSuccessAt: "2026-10-23T01:00:00.000Z",
  purchaseAmountIdr: 100000,
  flatAmountIdr: 5000,
  percentBps: 1000,
  commissionAmountIdr: 15000,
  refundReconciliationState: "partial_refund",
  providerRefundAmountIdr: 25000,
};
const input = (request: Request) =>
  request.postDataJSON() ??
  JSON.parse(new URL(request.url()).searchParams.get("data") ?? "{}");
async function mockApp(page: Page, role = "admin") {
  const state = {
    data: {
      decision: { ...decision },
      calculatedIdr: 15000,
      adjustmentIdr: -1000,
      obligationIdr: 14000,
      transferredIdr: 5000,
      outstandingIdr: 9000,
      overpaymentIdr: 0,
      status: "partial",
      entries: [
        {
          id: "entry-1",
          kind: "transfer",
          amountIdr: 5000,
          paidAt: "2026-10-22T17:00:00.000Z",
          reference: "BANK-OLD",
          createdAt: "2026-10-23T01:00:00.000Z",
          createdBy: "admin-1",
        },
      ],
    },
    calls: [] as string[],
    errors: [] as string[],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route(`${apiOrigin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    state.calls.push(pathname);
    if (pathname === "/api/auth/get-session")
      return route.fulfill({
        json: {
          user: {
            id: "synthetic-user",
            name: "Synthetic User",
            email: "ui@example.test",
            emailVerified: true,
            role,
            image: null,
          },
          session: {
            id: "synthetic-session",
            userId: "synthetic-user",
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        },
      });
    let result: unknown = [];
    if (pathname.endsWith("/listKolCommissions"))
      result = { items: [decision], nextCursor: null };
    else if (pathname.endsWith("/getKolSettlement")) {
      expect(input(route.request())).toEqual({
        json: { decisionId: decision.id },
      });
      result = state.data;
    } else if (pathname.includes("notification/"))
      result = { items: [], count: 0 };
    else if (pathname.includes("adminReferral/"))
      throw new Error(`Unmocked settlement RPC: ${pathname}`);
    return route.fulfill({ json: { json: result, meta: [] } });
  });
  return state;
}
async function open(page: Page) {
  await page.goto("/admin-kol-commissions");
  await page
    .getByRole("row")
    .filter({ hasText: "Synthetic KOL" })
    .getByRole("button", { name: "View settlement" })
    .click();
  await expect(
    page.getByText("Settlement · Synthetic KOL", { exact: false }),
  ).toBeVisible();
}
test("admin opens partial history and sees server-reported overpayment after reopening", async ({
  page,
}) => {
  const state = await mockApp(page);
  await open(page);
  await expect(
    page.getByText(
      "Transferred Rp5.000 · outstanding Rp9.000 · overpayment Rp0 · partial",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/BANK-OLD · recorded .* by admin-1 · entry-1/),
  ).toBeVisible();
  await expect(
    page.getByText(/transfer · Rp5.000 · paid 23\/10\/2026, 00:00:00/),
  ).toBeVisible();
  await expect(
    page.getByText(/Partial refund: historical calculation requires manual/),
  ).toBeVisible();
  Object.assign(state.data, {
    transferredIdr: 16000,
    outstandingIdr: 0,
    overpaymentIdr: 2000,
    status: "overpaid",
  });
  await page.getByRole("button", { name: "Close settlement" }).click();
  await page.getByRole("button", { name: "View settlement" }).click();
  await expect(
    page.getByText(
      "Transferred Rp16.000 · outstanding Rp0 · overpayment Rp2.000 · overpaid",
      { exact: true },
    ),
  ).toBeVisible();
  expect(state.errors).toEqual([]);
});
test("transfer preserves amount, WIB date, reference and retry identity", async ({
  page,
}) => {
  const state = await mockApp(page);
  const submitted: ReturnType<typeof input>[] = [];
  await page.route("**/rpc/adminReferral/recordKolTransfer", async (route) => {
    submitted.push(input(route.request()));
    if (submitted.length === 1)
      return route.fulfill({
        status: 400,
        json: {
          json: {
            defined: false,
            code: "BAD_REQUEST",
            status: 400,
            message: "Synthetic ambiguous failure",
          },
        },
      });
    return route.fulfill({ json: { json: { success: true }, meta: [] } });
  });
  await open(page);
  await page
    .getByLabel("Actual transfer amount (IDR)", { exact: true })
    .fill("6000");
  await page
    .getByLabel("Actual payment date (WIB)", { exact: true })
    .fill("2026-10-24");
  await page
    .getByLabel("Transfer reference", { exact: true })
    .fill("BANK-NEW-123");
  await page
    .getByRole("button", { name: "Record external transfer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic ambiguous failure",
  );
  await expect(
    page.getByLabel("Transfer reference", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry same operation", exact: true })
    .click();
  await expect(
    page.getByLabel("Transfer reference", { exact: true }),
  ).toBeEnabled();
  expect(submitted).toHaveLength(2);
  expect(submitted[1]).toEqual(submitted[0]);
  expect(submitted[0].json).toEqual({
    decisionId: decision.id,
    operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    amountIdr: 6000,
    paidAt: "2026-10-23T17:00:00.000Z",
    reference: "BANK-NEW-123",
  });
  expect(state.errors).toEqual([]);
});
test("adjustment requires reason and sends signed amount and obligation precondition", async ({
  page,
}) => {
  const state = await mockApp(page);
  const submitted: ReturnType<typeof input>[] = [];
  await page.route("**/rpc/adminReferral/adjustKolCommission", (route) => {
    submitted.push(input(route.request()));
    return route.fulfill({ json: { json: { success: true }, meta: [] } });
  });
  await open(page);
  await page
    .getByLabel("Signed obligation adjustment (IDR)", { exact: true })
    .fill("-2000");
  await page
    .getByRole("button", { name: "Record commission adjustment", exact: true })
    .click();
  expect(submitted).toHaveLength(0);
  expect(
    await page
      .getByLabel("Correction reason (required)", { exact: true })
      .evaluate((el: HTMLInputElement) => el.validity.valueMissing),
  ).toBe(true);
  await page
    .getByLabel("Correction reason (required)", { exact: true })
    .fill("Approved partial refund correction");
  await page
    .getByRole("button", { name: "Record commission adjustment", exact: true })
    .click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].json).toEqual({
    decisionId: decision.id,
    operationId: expect.any(String),
    amountIdr: -2000,
    expectedObligationIdr: 14000,
    reason: "Approved partial refund correction",
  });
  expect(state.errors).toEqual([]);
});
for (const blocked of ["REFUNDED", "unresolved"])
  test(`adjustment disabled for ${blocked}`, async ({ page }) => {
    const state = await mockApp(page);
    if (blocked === "REFUNDED")
      state.data.decision.paymentStatusSnapshot = "REFUNDED";
    else state.data.decision.providerSuccessTimeState = "unresolved";
    await open(page);
    await expect(
      page.getByRole("button", {
        name: "Record commission adjustment",
        exact: true,
      }),
    ).toBeDisabled();
  });
test("monthly export sends month and downloads returned CSV bytes and filename", async ({
  page,
}) => {
  await mockApp(page);
  const csv = "row_type,adjustment_idr\r\nsummary,-2000\r\n";
  let submitted: unknown;
  await page.route("**/rpc/adminReferral/exportKolMonthly", (route) => {
    submitted = input(route.request());
    return route.fulfill({
      json: { json: { filename: "kol-2026-09.csv", csv }, meta: [] },
    });
  });
  await page.goto("/admin-kol-commissions");
  await page
    .getByLabel("Activity month (WIB)", { exact: true })
    .fill("2026-09");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export monthly reconciliation CSV" })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("kol-2026-09.csv");
  expect(await readFile((await download.path())!, "utf8")).toBe(csv);
  expect(submitted).toEqual({ json: { month: "2026-09" } });
});
test("non-admin redirects before settlement RPC or controls", async ({
  page,
}) => {
  const state = await mockApp(page, "student");
  await page.goto("/admin-kol-commissions");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("button", { name: "View settlement" }),
  ).toHaveCount(0);
  expect(state.calls.filter((path) => path.includes("adminReferral/"))).toEqual(
    [],
  );
  expect(state.errors).toEqual([]);
});

for (const width of [320, 390, 720, 768, 1440]) {
  test(`settlement reflows at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await mockApp(page);
    state.data.entries[0]!.reference = "BANK-" + "X".repeat(180);
    await open(page);
    const panel = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Settlement · Synthetic KOL" });
    await panel.scrollIntoViewIfNeeded();
    const measurements = await panel.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      pageWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
    }));
    console.log(JSON.stringify({ viewportWidth: width, ...measurements }));
    await page.screenshot({
      path: testInfo.outputPath(`settlement-${width}.png`),
      fullPage: true,
    });
    expect(measurements.scrollWidth).toBeLessThanOrEqual(
      measurements.width + 1,
    );
    expect(measurements.pageScrollWidth).toBeLessThanOrEqual(
      measurements.pageWidth + 1,
    );
    // Scrolling changes shared page state; these checks must run sequentially.
    /* eslint-disable no-await-in-loop */
    for (const name of [
      "Export monthly reconciliation CSV",
      "Record external transfer",
      "Record commission adjustment",
    ]) {
      const button = page.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    /* eslint-enable no-await-in-loop */
    expect(state.errors).toEqual([]);
  });
}

test("settlement retry actions wrap and remain keyboard reachable at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await mockApp(page);
  await page.route("**/rpc/adminReferral/recordKolTransfer", (route) =>
    route.fulfill({
      status: 400,
      json: {
        json: {
          defined: false,
          code: "BAD_REQUEST",
          status: 400,
          message: "Synthetic ambiguous failure",
        },
      },
    }),
  );
  await open(page);
  await page
    .getByLabel("Actual transfer amount (IDR)", { exact: true })
    .fill("6000");
  await page
    .getByLabel("Actual payment date (WIB)", { exact: true })
    .fill("2026-10-24");
  await page.getByLabel("Transfer reference", { exact: true }).fill("BANK-NEW");
  await page
    .getByRole("button", { name: "Record external transfer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic ambiguous failure",
  );
  const retry = page.getByRole("button", {
    name: "Retry same operation",
    exact: true,
  });
  const review = page.getByRole("button", {
    name: "Review history and start new record",
    exact: true,
  });
  await retry.focus();
  await page.keyboard.press("Tab");
  await expect(review).toBeFocused();
  const bounds = await review.boundingBox();
  const size = await review.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  console.log(JSON.stringify({ retryReview: bounds, ...size }));
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight);
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Transfer reference", { exact: true }),
  ).toBeEnabled();
});
