import { expect, test, type Page } from "@playwright/test";

// Mocked browser behavior does not prove OAuth, persistence or DB authorization.
async function mockApp(
  page: Page,
  role: "student" | "admin" | null,
  pending = false,
) {
  const state = { pending };
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://localhost:3305/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/get-session") {
      return route.fulfill({
        json: role
          ? {
              user: {
                id: "synthetic-user",
                name: "Synthetic User",
                email: "ui@example.test",
                emailVerified: true,
                role,
                referralChoicePending: state.pending,
                image: null,
              },
              session: {
                id: "synthetic-session",
                userId: "synthetic-user",
                expiresAt: "2099-01-01T00:00:00.000Z",
              },
            }
          : null,
      });
    }
    if (url.pathname.startsWith("/rpc/")) {
      return route.fulfill({
        json: {
          json: url.pathname.includes("notification/")
            ? { items: [], count: 0 }
            : [],
          meta: [],
        },
      });
    }
    unexpected.push(url.pathname);
    return route.abort();
  });
  return { state, unexpected, errors };
}

for (const code of ["friend-code", null]) {
  test(`pending student saves ${code ?? "explicit no-code"} and leaves choice`, async ({
    page,
  }) => {
    const fixture = await mockApp(page, "student", true);
    let submitted: unknown;
    await page.route("**/rpc/referral/saveGoogleChoice", async (route) => {
      submitted = route.request().postDataJSON();
      fixture.state.pending = false;
      await route.fulfill({ json: { json: { success: true }, meta: [] } });
    });
    await page.goto("/classes");
    await expect(page).toHaveURL(/\/referral-choice$/);
    await expect(
      page.getByRole("button", { name: "Apply code", exact: true }),
    ).toBeDisabled();
    if (code) {
      await page.getByLabel("Referral code", { exact: true }).fill(code);
      await expect(
        page.getByLabel("Referral code", { exact: true }),
      ).toHaveValue(code.toUpperCase());
    }
    await page
      .getByRole("button", {
        name: code ? "Apply code" : "No referral code",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(submitted).toEqual({ json: { code: code?.toUpperCase() ?? null } });
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.errors).toEqual([]);
  });
}

test("failed referral save retains choice and enables retry", async ({
  page,
}) => {
  const fixture = await mockApp(page, "student", true);
  await page.route("**/rpc/referral/saveGoogleChoice", (route) =>
    route.fulfill({
      status: 400,
      json: {
        json: {
          defined: false,
          code: "BAD_REQUEST",
          status: 400,
          message: "Referral code is invalid",
        },
      },
    }),
  );
  await page.goto("/referral-choice");
  await page.getByLabel("Referral code", { exact: true }).fill("bad-code");
  await page.getByRole("button", { name: "Apply code", exact: true }).click();
  await expect(page.getByText("Referral code is invalid")).toBeVisible();
  await expect(page).toHaveURL(/\/referral-choice$/);
  await expect(page.getByLabel("Referral code", { exact: true })).toHaveValue(
    "BAD-CODE",
  );
  await expect(
    page.getByRole("button", { name: "No referral code", exact: true }),
  ).toBeEnabled();
  expect(fixture.errors).toEqual([]);
});

for (const role of [null, "admin", "student"] as const) {
  test(`referral choice redirects ${role ?? "signed-out"} without pending choice`, async ({
    page,
  }) => {
    await mockApp(page, role);
    await page.goto("/referral-choice");
    await expect(page).toHaveURL(role ? /\/dashboard$/ : /\/login$/);
    await expect(
      page.getByRole("heading", { name: "Choose a referral option" }),
    ).toHaveCount(0);
  });
}

const decision = {
  id: "decision-1",
  campaignName: "Partial campaign",
  code: "KOL",
  referredUserName: "Student",
  referredUserEmail: "student@example.test",
  paymentId: "payment-1",
  paymentReference: "ORDER-1",
  paymentStatus: "PAID",
  providerSuccessTimeState: "resolved",
  providerSuccessAt: "2026-10-23T01:00:00.000Z",
  purchaseAmountIdr: 100000,
  flatAmountIdr: 5000,
  percentBps: 1000,
  commissionAmountIdr: 15000,
  refundReconciliationState: "partial_refund",
  providerRefundAmountIdr: 25000,
};

test("KOL cursor pagination preserves reconciliation and unresolved-time evidence", async ({
  page,
}) => {
  const fixture = await mockApp(page, "admin");
  const inputs: unknown[] = [];
  const cursor = "2026-10-23T01:00:00.000500Z|decision-1";
  await page.route("**/rpc/adminReferral/listKolCommissions**", (route) => {
    const encoded = new URL(route.request().url()).searchParams.get("data");
    const body = route.request().postDataJSON() ?? JSON.parse(encoded ?? "{}");
    inputs.push(body.json);
    return route.fulfill({
      json: {
        json: body.json.cursor
          ? {
              items: [
                {
                  ...decision,
                  id: "decision-2",
                  campaignName: "Held campaign",
                  refundReconciliationState: "none",
                  providerSuccessTimeState: "unresolved",
                  providerSuccessAt: null,
                  commissionAmountIdr: 0,
                },
              ],
              nextCursor: null,
            }
          : { items: [decision], nextCursor: cursor },
        meta: [],
      },
    });
  });
  await page.goto("/admin-kol-commissions");
  await expect(
    page.getByText("Partial refund · reconcile", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Historical calculation; manual reconciliation required.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Provider refund amount: Rp25.000", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByText("Time unresolved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Commission held; provider has not supplied an authoritative success time.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(
    page.getByText("Partial campaign", { exact: true }),
  ).toBeVisible();
  expect(inputs).toContainEqual({ limit: 50, cursor });
  expect(inputs[0]).toEqual({ limit: 50 });
  expect(fixture.errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("KOL full refund displays zero historical commission", async ({
  page,
}) => {
  await mockApp(page, "admin");
  await page.route("**/rpc/adminReferral/listKolCommissions**", (route) =>
    route.fulfill({
      json: {
        json: {
          items: [
            {
              ...decision,
              campaignName: "Full refund campaign",
              paymentStatus: "REFUNDED",
              refundReconciliationState: "none",
              commissionAmountIdr: 0,
            },
          ],
          nextCursor: null,
        },
        meta: [],
      },
    }),
  );
  await page.goto("/admin-kol-commissions");
  const row = page.getByRole("row").filter({ hasText: "Full refund campaign" });
  await expect(row.getByText("REFUNDED", { exact: true })).toBeVisible();
  await expect(row.getByRole("cell").last()).toContainText("Rp0");
  await expect(
    row.getByText("Partial refund · reconcile", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
});

for (const failed of [false, true]) {
  test(`KOL ${failed ? "load failure" : "empty results"} is explicit`, async ({
    page,
  }) => {
    await mockApp(page, "admin");
    await page.route("**/rpc/adminReferral/listKolCommissions**", (route) =>
      route.fulfill(
        failed
          ? {
              status: 400,
              json: {
                defined: false,
                code: "BAD_REQUEST",
                status: 400,
                message: "Synthetic failure",
              },
            }
          : { json: { json: { items: [], nextCursor: null }, meta: [] } },
      ),
    );
    await page.goto("/admin-kol-commissions");
    await expect(
      page.getByText(
        failed
          ? "Commission decisions could not be loaded. Refresh to try again."
          : "No KOL commission decisions yet.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(
      0,
    );
  });
}
