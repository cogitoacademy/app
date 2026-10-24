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
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://localhost:3317/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
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
    stale: () => {
      stale = true;
    },
  };
}
test("KB single-field save carries version; conflict retains draft", async ({
  page,
}, testInfo) => {
  const state = await mockApp(page);
  await page.goto("/admin-content");
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
  await page.goto("/admin-content");
  await page
    .getByRole("button", { name: "Competition calendar", exact: true })
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
