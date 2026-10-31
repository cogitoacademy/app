import { expect, test, type Page } from "@playwright/test";
import { fillDateTimeInput } from "../helpers/date-time-input";

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

const campaign = {
  id: "campaign-1",
  name: "Demo KOL",
  code: "DEMO2026",
  activationAt: "2030-01-01T02:15:00.000Z",
  expiresAt: "2030-02-01T03:30:00.000Z",
  attributionWindowDays: 90,
  flatAmountIdr: 25000,
  percentBps: 1234,
  createdAt: "2026-10-25T00:00:00Z",
};
async function setup(page: Page) {
  await mock(page);
  let rows: (typeof campaign)[] = [];
  let failList = false;
  let conflict = false;
  let network = false;
  const payloads: any[] = [];
  await page.route("**/rpc/adminReferral/listKolCampaigns**", (route) =>
    failList
      ? route.fulfill({
          status: 500,
          json: {
            json: {
              code: "INTERNAL_SERVER_ERROR",
              status: 500,
              message: "Synthetic list failure",
            },
          },
        })
      : route.fulfill({ json: { json: rows, meta: [] } }),
  );
  await page.route(
    "**/rpc/adminReferral/createKolCampaign**",
    async (route) => {
      payloads.push(route.request().postDataJSON());
      if (network) return route.abort("failed");
      if (conflict)
        return route.fulfill({
          status: 409,
          json: {
            json: {
              defined: false,
              code: "CONFLICT",
              status: 409,
              message: "That referral code is already in use.",
            },
          },
        });
      await new Promise((resolve) => setTimeout(resolve, 300));
      rows = [campaign];
      return route.fulfill({ json: { json: campaign, meta: [] } });
    },
  );
  await page.goto("/admin-referrals");
  await page.getByRole("tab", { name: "KOL campaigns", exact: true }).click();
  return {
    payloads,
    conflict: () => {
      conflict = true;
    },
    network: () => {
      network = true;
    },
    failList: () => {
      failList = true;
    },
    recover: () => {
      failList = false;
    },
  };
}
async function fill(page: Page) {
  await page
    .getByRole("button", { name: "Create KOL campaign", exact: true })
    .click();
  await page.getByLabel("Campaign name", { exact: true }).fill("Demo KOL");
  await page.getByLabel("Referral code", { exact: true }).fill("demo2026");
  await fillDateTimeInput(
    page,
    "kol-activationAt",
    new Date(2030, 0, 1, 9, 15),
  );
  await fillDateTimeInput(page, "kol-expiresAt", new Date(2030, 1, 1, 10, 30));
  await page.getByLabel("Flat commission (IDR)", { exact: true }).fill("25000");
  await page.getByLabel("Commission (%)", { exact: true }).fill("12.34");
}
test("creates once with WIB dates, uppercase code, exact bps and refreshes immutable terms", async ({
  page,
}) => {
  const state = await setup(page);
  await expect(
    page.getByText("No KOL campaigns yet.", { exact: false }),
  ).toBeVisible();
  await fill(page);
  await page.getByRole("button", { name: "Save KOL campaign" }).click();
  await expect(
    page.getByRole("button", { name: "Creating KOL campaign…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Demo KOL · DEMO2026" }),
  ).toBeVisible();
  expect(state.payloads).toHaveLength(1);
  expect(state.payloads[0].json).toEqual({
    name: "Demo KOL",
    code: "DEMO2026",
    activationAt: campaign.activationAt,
    expiresAt: campaign.expiresAt,
    attributionWindowDays: 90,
    flatAmountIdr: 25000,
    percentBps: 1234,
  });
  await expect(page.getByText("Saved terms · immutable")).toBeVisible();
  await expect(page.getByLabel("Campaign name", { exact: true })).toHaveValue(
    "",
  );
});
for (const failure of ["conflict", "network"] as const)
  test(`${failure} preserves form and never automatically repeats creation`, async ({
    page,
  }) => {
    const state = await setup(page);
    state[failure]();
    await fill(page);
    await page.getByRole("button", { name: "Save KOL campaign" }).click();
    await expect(page.getByText(/Your entries are preserved/)).toBeVisible();
    await expect(page.getByLabel("Referral code", { exact: true })).toHaveValue(
      "demo2026",
    );
    await expect(
      page.getByLabel("Commission (%)", { exact: true }),
    ).toHaveValue("12.34");
    await page.waitForTimeout(1500);
    expect(state.payloads).toHaveLength(1);
  });
test("validation focuses first error and list failure recovers explicitly", async ({
  page,
}) => {
  const state = await setup(page);
  await page
    .getByRole("button", { name: "Create KOL campaign", exact: true })
    .click();
  await page.getByRole("button", { name: "Save KOL campaign" }).click();
  await expect(page.getByLabel("Campaign name", { exact: true })).toBeFocused();
  expect(state.payloads).toHaveLength(0);
  state.failList();
  await page.getByRole("button", { name: "Refresh campaigns" }).click();
  await expect(page.getByText("We couldn't load KOL campaigns.")).toBeVisible();
  state.recover();
  await page.getByRole("button", { name: "Retry campaigns" }).click();
  await expect(
    page.getByText("No KOL campaigns yet.", { exact: false }),
  ).toBeVisible();
});
for (const width of [320, 390, 768, 1440])
  test(`campaign form and saved terms fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await setup(page);
    await fill(page);
    await page.getByRole("button", { name: "Save KOL campaign" }).click();
    await expect(page.getByText("Saved terms · immutable")).toBeVisible();
    const panel = page
      .getByRole("heading", { name: "KOL campaigns", exact: true })
      .locator('xpath=ancestor::*[@data-slot="card"]');
    expect(
      await panel.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.right <= innerWidth + 1 &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
    ).toBe(true);
    expect(
      await panel
        .locator("button:visible")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) => button.scrollHeight <= button.clientHeight + 1,
          ),
        ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`kol-campaign-${width}.png`),
      fullPage: true,
    });
  });
