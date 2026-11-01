import { expect, test, type Page } from "@playwright/test";

async function mockApp(page: Page, active = true) {
  const calls: string[] = [];
  const choices: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = {
    id: "student",
    name: "V3 Student",
    email: "student@example.test",
    role: "student",
    emailVerified: true,
    image: null,
  };
  const packages = [
    { code: "starter", label: "Starter package", marks: 50, priceIdr: 350000 },
    { code: "learner", label: "Learner package", marks: 150, priceIdr: 975000 },
  ];
  const tutor = {
    id: "profile",
    userId: "tutor",
    displayName: "V3 Tutor",
    shortBio: "Debate mentor",
    affiliation: "Cogito",
    education: [],
    achievements: [],
    experiences: [],
    modality: "online",
    onlineMaxClassSize: 6,
    offlineMaxClassSize: 6,
    user: { name: "V3 Tutor", image: null },
    publishedAt: "2026-01-01T00:00:00Z",
    subjects: [
      {
        id: "law",
        name: "Law Debate",
        slug: "competition-debate-law",
        isSelectable: true,
        parent: {
          id: "debate",
          slug: "competition-debate",
          name: "Debate",
          parentColors: null,
        },
      },
    ],
    prices: { "1": 999 },
    pricesByModality: { online: { "1": 999 } },
    pricesByCompetition: {
      "competition-debate": { online: { "1": 44, "2": 28 } },
    },
    pricingRevision: 1,
    availabilitySlots: [],
  };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://localhost:3356") return route.continue();
    if (url.origin !== "http://localhost:3357") return route.abort();
    const path = url.pathname;
    calls.push(path);
    const headers = {
      "access-control-allow-origin": "http://localhost:3356",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,GET,OPTIONS",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (path.includes("/api/auth/"))
      return route.fulfill({
        headers,
        json: {
          user,
          session: {
            id: "session",
            userId: user.id,
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      });
    let data: unknown = [];
    if (path.endsWith("getProfile"))
      data = path.includes("tutors") ? tutor : user;
    else if (path.endsWith("listPublished")) data = [tutor];
    else if (path.endsWith("getConfig")) data = { testMode: false };
    else if (path.endsWith("getTopUpCatalog"))
      data = active
        ? { active: true, revision: 1, packages, exactSurchargeIdr: 250 }
        : { active: false, revision: null, packages: [] };
    else if (path.endsWith("listPackages"))
      data = {
        packages: [
          {
            code: "obsolete",
            name: "Obsolete package",
            marks: 120,
            priceIdr: 690000,
          },
        ],
      };
    else if (path.endsWith("listLedger"))
      data = { items: [], nextCursor: null };
    else if (path.endsWith("wallet/get"))
      data = { totalBalance: 200, availableBalance: 200, heldBalance: 0 };
    else if (path.includes("notification/")) data = { items: [], count: 0 };
    else if (path.endsWith("createTopUpQuote")) {
      const input = route.request().postDataJSON().json;
      const exactPackage =
        packages.find((pkg) => pkg.marks === input.marks) ?? null;
      data = {
        quoteId: "quote",
        revision: 1,
        marks: input.marks,
        customAmountIdr: exactPackage?.priceIdr ?? 1015000,
        exactPackage,
        recommendedPackage: exactPackage ? null : packages[1],
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };
    } else if (path.endsWith("createPurchaseFromQuote")) {
      choices.push(route.request().postDataJSON().json.choice);
      data = {
        paymentId: "payment",
        providerReference: "stub",
        checkoutUrl: null,
        status: "PENDING",
      };
    }
    return route.fulfill({ headers, json: { json: data, meta: [] } });
  });
  return { calls, choices, errors };
}

test("inactive V3 shows no legacy package fallback", async ({ page }) => {
  const state = await mockApp(page, false);
  await page.goto("/balance");
  await expect(
    page.getByText("Top-up is unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Obsolete package")).toHaveCount(0);
  await expect(page.getByText("Choose an exact amount")).toHaveCount(0);
  expect(state.calls.some((path) => path.endsWith("listPackages"))).toBe(false);
  expect(state.errors).toEqual([]);
});

for (const choice of ["custom", "recommended"] as const) {
  test(`exact top-up uses V3 quote and explicit ${choice} choice`, async ({
    page,
  }) => {
    const state = await mockApp(page);
    await page.goto("/balance");
    await expect(page.getByText("Choose an exact amount")).toBeVisible();
    const amount = page.locator("#custom-marks-amount");
    await amount.click();
    await amount.press("ControlOrMeta+A");
    await amount.pressSequentially("140");
    await amount.press("Tab");
    await expect(amount).toHaveValue("140");
    await page
      .getByRole("button", { name: "Get a price", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review your top-up" }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: choice === "custom" ? /Buy 140 Marks/ : /Choose Learner package/,
      })
      .click();
    await expect.poll(() => state.choices).toEqual([choice]);
    expect(state.calls.some((path) => path.endsWith("createPurchase"))).toBe(
      false,
    );
    expect(state.calls.some((path) => path.endsWith("listPackages"))).toBe(
      false,
    );
    expect(state.errors).toEqual([]);
  });
}

test("package purchase also goes through a V3 quote", async ({ page }) => {
  const state = await mockApp(page);
  await page.goto("/balance");
  await page.getByRole("button", { name: "Buy", exact: true }).last().click();
  await expect(
    page.getByRole("heading", { name: "Review your top-up" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Choose package/ }).click();
  await expect.poll(() => state.choices).toEqual(["package"]);
  expect(state.calls.some((path) => path.endsWith("createPurchase"))).toBe(
    false,
  );
  expect(state.errors).toEqual([]);
});

test("tutor drawer displays competition rates and ignores old price maps", async ({
  page,
}) => {
  const state = await mockApp(page);
  await page.goto("/tutors");
  await page
    .getByRole("button", { name: /V3 Tutor/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Pricing", exact: true }),
  ).toBeVisible();
  const table = page.getByRole("table").first();
  await expect(table.getByRole("row").nth(1)).toContainText("44");
  await expect(table).not.toContainText("999");
  expect(state.errors).toEqual([]);
});
