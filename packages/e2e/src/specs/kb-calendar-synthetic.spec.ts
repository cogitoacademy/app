import { expect, test, type Page } from "@playwright/test";
// Mocked UI/wire coverage only; no DB, storage, authorization or provider proof.
const resource = {
  id: "synthetic",
  sourceId: null,
  title: "Panduan sintetis",
  description: null,
  category: "guide",
  fileId: "synthetic-pdf",
  isActive: true,
  sortOrder: 0,
  version: 2,
};
async function mockApp(page: Page, role = "admin") {
  const saves: any[] = [],
    errors: string[] = [];
  let stale = false;
  const calls: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://localhost:3317/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    if (path === "/api/auth/get-session")
      return route.fulfill({
        json: {
          user: {
            id: "synthetic-admin",
            name: "Synthetic Admin",
            email: "ui@example.test",
            emailVerified: true,
            role,
            image: null,
          },
          session: {
            id: "synthetic",
            userId: "synthetic-admin",
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      });
    const body =
      route.request().postDataJSON() ??
      JSON.parse(
        new URL(route.request().url()).searchParams.get("data") ?? "{}",
      );
    let result: unknown = [];
    if (path === "/rpc/content/listStudentResources")
      result = {
        items: [resource],
        access: { eligible: true, threshold: 35, balance: 200 },
      };
    if (path === "/rpc/booking/listMine")
      result = {
        items: [],
        nextCursor: null,
        counts: { action: 0, upcoming: 0, recurring: 0, history: 0, all: 0 },
      };
    if (path === "/rpc/wallet/get")
      result = { totalBalance: 200, heldBalance: 0, availableBalance: 200 };
    if (path === "/rpc/adminContent/list")
      result = body.json.kind === "resource" ? [resource] : [];
    if (path === "/rpc/adminContent/categories")
      result = [
        { id: "parent", name: "Debate", parentId: null, isActive: true },
      ];
    if (
      path === "/rpc/adminContent/update" ||
      path === "/rpc/adminContent/create"
    ) {
      saves.push(body.json);
      if (stale)
        return route.fulfill({
          status: 409,
          json: {
            defined: false,
            code: "CONFLICT",
            status: 409,
            message: "This entry changed. Reload and review before saving.",
          },
        });
      result = { id: resource.id, version: 3 };
    }
    if (path.includes("notification/")) result = { items: [], count: 0 };
    return route.fulfill({ json: { json: result, meta: [] } });
  });
  return {
    saves,
    errors,
    calls,
    stale: () => {
      stale = true;
    },
  };
}
test("KB single-field save carries version; conflict retains draft", async ({
  page,
}, testInfo) => {
  const state = await mockApp(page);
  await page.goto("/knowledge-bank");
  await page
    .getByRole("button", { name: "Manage resources", exact: true })
    .click();
  expect(
    await page
      .getByRole("button", { name: /Panduan sintetis/ })
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(40);
  await page.getByRole("button", { name: /Panduan sintetis/ }).click();
  await expect(
    page.getByText("One value per field, in any language."),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("editor-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("editor-mobile.png"),
    fullPage: true,
  });
  await page.getByLabel("Title", { exact: true }).fill("Panduan diperbarui");
  await page.getByLabel("Reason for change").fill("Correct title");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Changes saved live." }),
  ).toBeVisible();
  expect(state.saves[0]).toMatchObject({
    id: resource.id,
    expectedVersion: 2,
    entry: {
      kind: "resource",
      values: { title: "Panduan diperbarui", fileId: "synthetic-pdf" },
    },
  });
  await page.getByRole("button", { name: /Panduan sintetis/ }).click();
  state.stale();
  await page.getByLabel("Title", { exact: true }).fill("Unsaved correction");
  await page.getByLabel("Reason for change").fill("Try correction");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "draft is retained" }),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Unsaved correction",
  );
  expect(state.errors).toEqual([]);
});
test("calendar save carries explicit WIB timestamps and catalog ID", async ({
  page,
}) => {
  const state = await mockApp(page);
  await page.goto("/calendar");
  await page
    .getByRole("button", { name: "Manage calendar", exact: true })
    .click();
  await page.getByRole("button", { name: "Create entry", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Lomba sintetis");
  await page
    .getByLabel("Start (ISO timestamp with timezone)")
    .fill("2026-11-01T09:00:00+07:00");
  await page
    .getByLabel("End (ISO timestamp with timezone)")
    .fill("2026-11-02T17:00:00+07:00");
  await page.getByRole("checkbox", { name: "Debate", exact: true }).check();
  await page.getByLabel("Reason for change").fill("New competition");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Changes saved live." }),
  ).toBeVisible();
  expect(state.saves[0]).toMatchObject({
    entry: {
      kind: "event",
      values: {
        title: "Lomba sintetis",
        startDate: "2026-11-01T09:00:00+07:00",
        categoryIds: ["parent"],
      },
    },
  });
  expect(state.errors).toEqual([]);
});
test("student navigation redirects away from editor", async ({ page }) => {
  const state = await mockApp(page, "student");
  await page.goto("/admin-content");
  await expect(page).toHaveURL(/dashboard/);
  expect(state.saves).toEqual([]);
});

test("agenda preserves two distinct IDs on each inclusive WIB date and deduplicates ID/date", async ({
  page,
}) => {
  await mockApp(page);
  await page.clock.install({ time: new Date("2026-10-24T12:00:00Z") });
  const event = {
    id: "first",
    title: "Synthetic multi-day",
    description: null,
    location: "Online",
    startDate: "2026-10-24T16:59:00Z",
    endDate: "2026-10-24T17:01:00Z",
    categories: [],
    educationLevels: [],
    scale: null,
    organizer: null,
    registrationDeadline: null,
    registrationLink: null,
    socialMediaLink: null,
  };
  await page.route(
    "http://localhost:3317/rpc/content/listCompetitions**",
    (route) =>
      route.fulfill({
        json: { json: [event, event, { ...event, id: "second" }], meta: [] },
      }),
  );
  await page.goto("/calendar");
  await expect(
    page.getByRole("button", { name: /Calendar options, month view/ }),
  ).toBeVisible();
  await page.keyboard.press("a");
  await expect(
    page.getByRole("button", {
      name: "View details for Synthetic multi-day",
      exact: true,
    }),
  ).toHaveCount(4);
  await expect(
    page.getByText("Saturday, 24 October 2026 · WIB", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByText("Sunday, 25 October 2026 · WIB", { exact: true }),
  ).toHaveCount(2);
});

for (const role of ["student", "tutor"]) {
  test(`${role} reads canonical pages without admin management queries`, async ({
    page,
  }) => {
    const state = await mockApp(page, role);
    await page.goto("/knowledge-bank");
    await expect(
      page.getByRole("heading", {
        name: "Learn from curated resources",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Manage resources", exact: true }),
    ).toHaveCount(0);
    await page.goto("/calendar");
    await expect(
      page.getByRole("heading", {
        name: "Your Gateway to the World Stage",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Manage calendar", exact: true }),
    ).toHaveCount(0);
    expect(
      state.calls.filter((path) => path.startsWith("/rpc/adminContent/")),
    ).toEqual([]);
    expect(state.errors).toEqual([]);
  });
}

test("legacy editor redirects admin to canonical Knowledge Bank", async ({
  page,
}) => {
  await mockApp(page);
  await page.goto("/admin-content");
  await expect(page).toHaveURL(/\/knowledge-bank$/);
  await expect(
    page.getByRole("button", { name: "Manage resources", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "KB & calendar", exact: true }),
  ).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) {
  test(`canonical editors fit at ${width}px and retain view toggle`, async ({
    page,
  }, testInfo) => {
    const state = await mockApp(page);
    await page.setViewportSize({ width, height: 900 });
    /* eslint-disable no-await-in-loop -- Exercise each route sequentially in the same page. */
    for (const [path, manage, view] of [
      ["/knowledge-bank", "Manage resources", "View resources"],
      ["/calendar", "Manage calendar", "View calendar"],
    ]) {
      await page.goto(path!);
      await page.getByRole("button", { name: manage!, exact: true }).click();
      await page
        .getByRole("button", { name: "Create entry", exact: true })
        .click();
      await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
      const issues = await page
        .locator(
          'main [data-slot="card"], main [data-slot="field"], main button',
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => {
              if (!el.getClientRects().length) return false;
              const r = el.getBoundingClientRect();
              return (
                r.right > innerWidth + 1 ||
                r.left < -1 ||
                el.scrollWidth > el.clientWidth + 1 ||
                el.scrollHeight > el.clientHeight + 1
              );
            })
            .map((el) => el.textContent?.slice(0, 50)),
        );
      expect(issues).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${path!.slice(1)}-${width}.png`),
        fullPage: true,
      });
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.getByRole("button", { name: view!, exact: true }).click();
      await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: view!, exact: true }).click();
      await expect(
        page.getByRole("button", { name: manage!, exact: true }),
      ).toBeVisible();
    }
    /* eslint-enable no-await-in-loop */
    expect(state.errors).toEqual([]);
  });
}
