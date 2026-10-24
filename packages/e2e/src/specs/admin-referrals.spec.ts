import { expect, test, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });
const user = {
  id: "admin-preview",
  name: "Admin Preview",
  email: "admin@example.test",
  role: "admin",
  emailVerified: true,
  image: null,
};
const pending = {
  id: "choice-1",
  kind: "friend",
  code: "REF970",
  decidedAt: "2026-10-24T06:29:04Z",
  studentId: "s1",
  studentName: "Referral Demo",
  studentEmail: "student@example.test",
  emailVerified: true,
  referrerId: "r1",
  referrerName: "Alya Pratama",
  referrerEmail: "alya@example.test",
  campaignName: null,
  settingsVersion: 1,
  welcomeMarksSnapshot: 15,
  welcomeCreditedMarks: 15,
  welcomeLedgerId: "ledger-1",
  friendRewardMarksSnapshot: 15,
  friendDecisionId: null,
  friendCreditedMarks: null,
  friendLedgerMarks: null,
  completionType: null,
  completionId: null,
  completedAt: null,
  semesterKey: null,
  semesterCapMarks: null,
  friendLedgerId: null,
  kolDecisionId: null,
  paymentId: null,
  paymentStatus: null,
  commissionIdr: null,
  providerTimeState: null,
  refundState: null,
  attributionExpiresAt: null,
};
async function mock(page: Page, role = "admin") {
  const inputs: unknown[] = [];
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        user: { ...user, role },
        session: {
          id: "session",
          userId: user.id,
          expiresAt: "2099-01-01T00:00:00Z",
        },
      },
    }),
  );
  await page.route("**/rpc/**", (route) => {
    const url = new URL(route.request().url());
    const input =
      route.request().postDataJSON()?.json ??
      JSON.parse(url.searchParams.get("data") ?? "{}").json ??
      {};
    let data: unknown = [];
    if (url.pathname.endsWith("/adminReferral/listUsage")) {
      inputs.push(input);
      const empty = input.search === "missing";
      data = {
        items: empty ? [] : [pending],
        summary: {
          signups: empty ? 0 : 26,
          codesUsed: empty ? 0 : 3,
          welcomeMarks: empty ? 0 : 390,
          friendMarks: empty ? 0 : 15,
        },
        page: input.page ?? 0,
        limit: 25,
      };
    } else if (url.pathname.endsWith("/auth/me"))
      data = { user: { ...user, role } };
    else if (url.pathname.includes("notification/"))
      data = { items: [], count: 0 };
    else if (url.pathname.endsWith("/wallet/get"))
      data = { totalBalance: 15, heldBalance: 0, availableBalance: 15 };
    return route.fulfill({ json: { json: data, meta: [] } });
  });
  return inputs;
}

test("admin searches, paginates, inspects evidence and sees an explicit empty state", async ({
  page,
}) => {
  const inputs = await mock(page);
  await page.goto("/admin-referrals");
  await expect(
    page.getByRole("heading", { name: "Referral usage", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Awaiting paid completion", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View details for Referral Demo" })
    .click();
  await expect(page.getByText("ledger-1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 · 26 matching choices")).toBeVisible();
  await page.getByLabel("Search referral usage").fill("missing");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No referral choices match these filters."),
  ).toBeVisible();
  expect(inputs).toContainEqual({
    search: "missing",
    kind: "all",
    page: 0,
    limit: 25,
  });
});
test("admin usage fits mobile and renders retry on failure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto("/admin-referrals");
  await expect(page.getByText("REF970", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("referral-usage-mobile.png"),
    fullPage: true,
  });
  await page.route("**/rpc/adminReferral/listUsage**", (route) =>
    route.fulfill({
      status: 500,
      json: {
        json: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Synthetic failure",
          status: 500,
        },
        meta: [],
      },
    }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("We couldn't load referral usage.")).toBeVisible({
    timeout: 15000,
  });
});
test("student cannot open the admin usage page", async ({ page }) => {
  await mock(page, "student");
  await page.goto("/admin-referrals");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Referral usage", exact: true }),
  ).toHaveCount(0);
});
