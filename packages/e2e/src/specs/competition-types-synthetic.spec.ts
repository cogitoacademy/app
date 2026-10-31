import { expect, test, type Page } from "@playwright/test";

const colors = {
  lightTextColor: "oklch(0.3 0.1 260)",
  lightBackgroundColor: "oklch(0.95 0.02 260)",
  darkTextColor: "oklch(0.9 0.03 260)",
  darkBackgroundColor: "oklch(0.3 0.08 260)",
};
const parent = (id: string, name: string, extra = {}) => ({
  id,
  name,
  slug: id,
  parentId: null,
  parent: null,
  nameId: null,
  description: null,
  descriptionId: null,
  sortOrder: 0,
  version: 1,
  isActive: true,
  selectable: true,
  rateConfigured: true,
  parentColors: colors,
  ...colors,
  ...extra,
});
async function mockCatalog(page: Page, role = "admin") {
  const debate = parent("debate", "Debate");
  const science = parent("science", "Science");
  let rows = [
    debate,
    science,
    parent("retired", "Retired competition", {
      isActive: false,
      selectable: false,
    }),
    {
      ...parent("parliamentary", "Parliamentary debate"),
      parentId: "debate",
      parent: debate,
    },
    parent("draft", "New competition", {
      isActive: false,
      selectable: false,
      rateConfigured: false,
    }),
  ];
  const writes: Array<{ path: string; input: any }> = [];
  let conflict = false;
  const user = {
    id: "catalog-admin",
    name: "Admin",
    email: "catalog@example.test",
    role,
    emailVerified: true,
  };
  await page.route("http://localhost:3377/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/api/auth/"))
      return route.fulfill({
        json: {
          user,
          session: {
            id: "session",
            userId: user.id,
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      });
    const input =
      route.request().postDataJSON()?.json ??
      JSON.parse(url.searchParams.get("data") ?? "{}").json ??
      {};
    const key = url.pathname.split("/").at(-1)!;
    let data: unknown = [];
    if (key === "listCompetitionCatalog")
      data = rows
        .map((row) => ({
          ...row,
          parent:
            rows.find((candidate) => candidate.id === row.parentId) ?? null,
        }))
        .filter(
          (row) =>
            !input.query ||
            `${row.name} ${row.slug} ${row.parent?.name ?? ""}`
              .toLowerCase()
              .includes(input.query.toLowerCase()),
        );
    else if (key === "getCompetitionCatalogEntry")
      data = {
        ...rows.find((row) => row.id === input.id),
        children: rows.filter((row) => row.parentId === input.id),
      };
    else if (key === "previewCompetitionCatalogImpact")
      data = {
        entry: rows.find((row) => row.id === input.id),
        childCount: rows.filter((row) => row.parentId === input.id).length,
        totalReferences: 0,
        references: {},
      };
    else if (
      [
        "updateCompetitionCatalogEntry",
        "archiveCompetitionCatalogEntry",
        "restoreCompetitionCatalogEntry",
        "deleteCompetitionCatalogEntry",
        "moveCompetitionSpecialization",
        "createCompetitionParent",
        "createCompetitionSpecialization",
      ].includes(key)
    ) {
      writes.push({ path: key, input });
      if (conflict && key === "updateCompetitionCatalogEntry") {
        rows = rows.map((row) =>
          row.id === input.id ? { ...row, version: 2 } : row,
        );
        conflict = false;
        return route.fulfill({
          status: 409,
          json: {
            json: {
              defined: false,
              code: "CONFLICT",
              status: 409,
              message: "changed in another admin session",
            },
          },
        });
      }
      if (key.startsWith("create")) {
        const owner = rows.find((row) => row.id === input.parentId);
        const created = {
          ...parent(input.slug, input.name),
          ...input,
          parentId: input.parentId ?? null,
          parent: owner ?? null,
          isActive: key === "createCompetitionSpecialization",
          selectable: key === "createCompetitionSpecialization",
          rateConfigured: key === "createCompetitionSpecialization",
        };
        rows = [...rows, created];
        data = created;
      } else {
        rows = rows.flatMap((row) =>
          row.id !== input.id
            ? [row]
            : key === "deleteCompetitionCatalogEntry"
              ? []
              : [
                  {
                    ...row,
                    ...input,
                    version: row.version + 1,
                    isActive:
                      key === "archiveCompetitionCatalogEntry"
                        ? false
                        : key === "restoreCompetitionCatalogEntry"
                          ? true
                          : row.isActive,
                  },
                ],
        );
        data = rows.find((row) => row.id === input.id) ?? {};
      }
    } else if (key === "me") data = { user };
    else if (url.pathname.includes("notification/"))
      data = { items: [], count: 0 };
    return route.fulfill({ json: { json: data, meta: [] } });
  });
  await page.goto("/admin-competitions", { waitUntil: "domcontentloaded" });
  return {
    writes,
    conflict: () => {
      conflict = true;
    },
  };
}
async function edit(page: Page, name = "Debate") {
  await page
    .getByRole("button", { name: `Edit competition ${name}`, exact: true })
    .click();
  await expect(page.getByRole("dialog", { name })).toBeVisible();
}

test("directory search retains focus, finds child with parent context and filters archived", async ({
  page,
}) => {
  await mockCatalog(page);
  await expect(
    page.getByRole("heading", { name: "Competition types", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const search = page.getByLabel("Search competition catalog");
  await search.fill("parliamentary");
  await expect(
    page.getByRole("button", { name: /Edit specialization Parliamentary/ }),
  ).toBeVisible();
  await expect(search).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Edit competition Debate", exact: true }),
  ).toBeVisible();
  await search.fill("");
  await page.getByRole("combobox", { name: "Filter catalog status" }).click();
  await page.getByRole("option", { name: "Archived", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Edit competition Retired competition",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Edit specialization Parliamentary/ }),
  ).toHaveCount(0);
});

test("edit keeps version/reason and conflicting drafts, dirty close asks before discarding", async ({
  page,
}) => {
  const state = await mockCatalog(page);
  await edit(page);
  await page
    .getByLabel("Name (English) *", { exact: true })
    .fill("Debate revised");
  await page
    .getByLabel("Change reason *", { exact: true })
    .fill("Rename for clarity");
  state.conflict();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("another admin session");
  await expect(
    page.getByLabel("Name (English) *", { exact: true }),
  ).toHaveValue("Debate revised");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Close catalog editor").click();
  await expect(
    page.getByRole("dialog", { name: "Debate", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Catalog entry saved", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0]?.input).toMatchObject({
    id: "debate",
    expectedVersion: 1,
    reason: "Rename for clarity",
  });
  expect(state.writes[1]?.input).toMatchObject({
    expectedVersion: 2,
    name: "Debate revised",
  });
  await page.getByLabel("Close catalog editor").click();
  await expect(page.locator('[data-slot="drawer-popup"]')).toBeHidden();
  await expect(
    page.getByRole("button", {
      name: "Edit competition Debate revised",
      exact: true,
    }),
  ).toBeFocused();
});

test("creation and lifecycle retain guarded impact and reason workflow", async ({
  page,
}) => {
  const state = await mockCatalog(page);
  await page
    .getByRole("button", { name: "Add specialization to Debate", exact: true })
    .click();
  await page
    .getByLabel("Name (English) *", { exact: true })
    .fill("Public speaking");
  await page.getByLabel("Slug", { exact: true }).fill("public-speaking");
  await page
    .getByLabel("Change reason *", { exact: true })
    .fill("New specialization");
  await page.getByRole("button", { name: "Create entry", exact: true }).click();
  await expect(
    page.getByText("Specialization added", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0]).toMatchObject({
    path: "createCompetitionSpecialization",
    input: {
      parentId: "debate",
      slug: "public-speaking",
      reason: "New specialization",
    },
  });
  await page.getByLabel("Close catalog editor").click();
  await edit(page);
  await page.getByText("Availability and deletion", { exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const deletion = page.getByRole("dialog", {
    name: "Delete unused entry",
    exact: true,
  });
  await expect(
    deletion.getByRole("button", { name: /Delete/ }).last(),
  ).toBeDisabled();
  await deletion.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  const archive = page.getByRole("dialog", {
    name: "Archive catalog entry",
    exact: true,
  });
  await archive.getByLabel("Reason *").fill("Retire old category");
  await archive
    .getByRole("button", { name: /Archive/ })
    .last()
    .click();
  await expect(
    page.getByText("Catalog entry archived", { exact: true }),
  ).toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({
    path: "archiveCompetitionCatalogEntry",
    input: { id: "debate", expectedVersion: 1, reason: "Retire old category" },
  });
});

for (const width of [320, 390, 768, 1440])
  test(`directory and editor fit ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCatalog(page);
    await expect(
      page.getByRole("heading", { name: "Competition types", exact: true }),
    ).toBeVisible();
    const check = async () => {
      const issues = await page
        .locator(
          'main [data-slot="card"], main [data-slot="field"], main button, [data-slot="drawer-popup"], [data-slot="drawer-popup"] [data-slot="field"], [data-slot="drawer-popup"] button',
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => {
              if (!el.getClientRects().length) return false;
              if (el.closest('[aria-label="Competition types table"]'))
                return false;
              const r = el.getBoundingClientRect();
              return (
                r.left < -1 ||
                r.right > innerWidth + 1 ||
                el.scrollWidth > el.clientWidth + 1 ||
                (el.tagName === "BUTTON" &&
                  el.scrollHeight > el.clientHeight + 1)
              );
            })
            .map(
              (el) =>
                `${el.getAttribute("data-slot") ?? el.tagName}:${el.textContent?.slice(0, 35)}`,
            ),
        );
      expect(issues).toEqual([]);
    };
    await check();
    await page.screenshot({
      path: info.outputPath(`directory-${width}.png`),
      fullPage: true,
    });
    await edit(page);
    await expect
      .poll(() =>
        page
          .locator('[data-slot="drawer-popup"]')
          .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
      )
      .toBe(width);
    await check();
    await page.screenshot({
      path: info.outputPath(`editor-${width}.png`),
      fullPage: true,
    });
  });

test("student cannot open the admin catalog", async ({ page }) => {
  const state = await mockCatalog(page, "student");
  await expect(page).toHaveURL(/dashboard/);
  expect(state.writes).toEqual([]);
});

test("new competition validates all palette values and drafts its existing creation contract", async ({
  page,
}) => {
  const state = await mockCatalog(page);
  await page
    .getByRole("button", { name: "Add competition", exact: true })
    .click();
  await page.getByLabel("Name (English) *", { exact: true }).fill("Robotics");
  await page.getByLabel("Slug", { exact: true }).fill("robotics");
  await page
    .getByLabel("Change reason *", { exact: true })
    .fill("Add robotics catalog");
  await expect(
    page.getByRole("button", { name: "Create entry", exact: true }),
  ).toBeDisabled();
  for (const [key, value] of Object.entries(colors))
    // eslint-disable-next-line no-await-in-loop -- Controlled fields share editor state.
    await page.locator(`#palette-${key}`).fill(value);
  await page.getByRole("button", { name: "Create entry", exact: true }).click();
  await expect(
    page.getByText("Competition added as a draft", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0]).toMatchObject({
    path: "createCompetitionParent",
    input: {
      name: "Robotics",
      slug: "robotics",
      reason: "Add robotics catalog",
      ...colors,
    },
  });
});

test("palette previews follow unsaved edits and moving a type retains reason and version", async ({
  page,
}) => {
  const state = await mockCatalog(page);
  await edit(page);
  await page.getByText("Display colors", { exact: true }).click();
  await page
    .locator("#palette-lightBackgroundColor")
    .fill("oklch(0.8 0.05 120)");
  await expect(
    page.getByText("Background: oklch(0.8 0.05 120)", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Close catalog editor").click();
  await page
    .getByRole("button", { name: /Edit specialization Parliamentary/ })
    .click();
  await page.getByText("Move specialization", { exact: true }).click();
  await page.getByLabel("Destination", { exact: true }).click();
  await page.getByRole("option", { name: "Science", exact: true }).click();
  await page.locator("#move-reason").fill("Reclassify unused specialization");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Close catalog editor").click();
  await expect(page.getByLabel("Destination", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(
    page.getByText("Specialization moved", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0]).toMatchObject({
    path: "moveCompetitionSpecialization",
    input: {
      id: "parliamentary",
      parentId: "science",
      expectedVersion: 1,
      reason: "Reclassify unused specialization",
    },
  });
});

for (const width of [320, 390, 768]) {
  test(`catalog toolbar and horizontal table scroll at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCatalog(page);
    const search = page.getByRole("textbox", {
      name: "Search competition catalog",
    });
    const filter = page.getByRole("combobox", {
      name: "Filter catalog status",
    });
    const add = page.getByRole("button", {
      name: "Add competition",
      exact: true,
    });
    const searchBox = (await search.boundingBox())!;
    for (const control of [filter, add]) {
      await expect(control).toBeVisible();
      const box = (await control.boundingBox())!;
      expect(Math.abs(box.y - searchBox.y)).toBeLessThan(2);
      expect(box.width).toBeLessThanOrEqual(40);
    }
    await expect(add).toHaveText("");
    await expect(
      page.getByRole("status").filter({ hasText: /^4 groups$/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "About competition colors" })
      .click();
    await expect(
      page.getByText("Specializations inherit their competition’s colors.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const table = page.getByRole("region", { name: "Competition types table" });
    const dimensions = await table.evaluate((el) => {
      el.scrollLeft = 150;
      return {
        width: el.clientWidth,
        scrollWidth: el.scrollWidth,
        left: el.scrollLeft,
      };
    });
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.width);
    expect(dimensions.left).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await filter.click();
    await page.getByRole("option", { name: "Archived", exact: true }).click();
    await expect(
      table.getByRole("button", {
        name: "Edit competition Retired competition",
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      table.getByRole("button", {
        name: "Edit competition Debate",
        exact: true,
      }),
    ).toHaveCount(0);
    await add.click();
    await expect(
      page.getByRole("heading", { name: "Add competition", exact: true }),
    ).toBeVisible();
  });
}
