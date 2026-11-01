import { randomUUID } from "node:crypto";
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../fixtures/test-accounts";
import { resetE2eAuthRateLimit } from "../fixtures/auth-rate-limit";

type CatalogEntry = {
  id: string;
  version: number;
  slug: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  rateConfigured: boolean;
  lightBackgroundColor?: string | null;
};

async function loginAsAdmin(page: Page) {
  await page.context().clearCookies();
  resetE2eAuthRateLimit();
  await page.goto("/login");
  await page.locator("input#email").fill(ADMIN_EMAIL);
  await page.locator("input#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(/\/(dashboard|profile)(?:$|\/)/);
}

async function createAdminApiContext() {
  resetE2eAuthRateLimit();
  const serverUrl = process.env.SERVER_URL ?? "http://localhost:3101";
  const context = await request.newContext({ baseURL: serverUrl });
  try {
    const response = await context.post("/api/auth/sign-in/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (!response.ok()) {
      throw new Error(`Admin API sign-in returned ${response.status()}`);
    }
    return context;
  } catch (error) {
    await context.dispose();
    throw error;
  }
}

async function adminRpc<T>(
  context: APIRequestContext,
  procedure: string,
  input: unknown,
) {
  const response = await context.post(`/rpc/admin/${procedure}`, {
    data: { json: input },
  });
  if (!response.ok()) {
    throw new Error(
      `${procedure} at ${response.url()} returned ${response.status()}: ${await response.text()}`,
    );
  }
  const result = (await response.json()) as { json: T };
  return result.json;
}

async function deleteEntry(
  context: APIRequestContext,
  id: string,
  reason: string,
) {
  const current = await adminRpc<CatalogEntry>(
    context,
    "getCompetitionCatalogEntry",
    { id },
  );
  await adminRpc(context, "deleteCompetitionCatalogEntry", {
    id,
    expectedVersion: current.version,
    reason,
  });
}

test("admin can archive, restore, and move an unused specialization", async ({
  page,
}) => {
  const adminApi = await createAdminApiContext();

  const suffix = randomUUID().slice(0, 8);
  const destinationSlug = `e2e-catalog-destination-${suffix}`;
  const childSlug = `e2e-catalog-specialization-${suffix}`;
  let destinationId: string | undefined;
  let childId: string | undefined;

  try {
    await loginAsAdmin(page);
    const entries = await adminRpc<CatalogEntry[]>(
      adminApi,
      "listCompetitionCatalog",
      { includeArchived: true },
    );
    const sourceParent = entries.find(
      (entry) =>
        entry.parentId === null && entry.isActive && entry.rateConfigured,
    );
    expect(
      sourceParent,
      "a rate-ready active parent is required",
    ).toBeDefined();

    const destination = await adminRpc<CatalogEntry>(
      adminApi,
      "createCompetitionParent",
      {
        slug: destinationSlug,
        name: `E2E destination ${suffix}`,
        lightTextColor: "oklch(1 0 0)",
        lightBackgroundColor: "oklch(0.52 0.14 250)",
        darkTextColor: "oklch(1 0 0)",
        darkBackgroundColor: "oklch(0.38 0.12 250)",
        sortOrder: 900,
        reason: "Create destination for catalog browser coverage",
      },
    );
    destinationId = destination.id;

    const child = await adminRpc<CatalogEntry>(
      adminApi,
      "createCompetitionSpecialization",
      {
        parentId: sourceParent!.id,
        slug: childSlug,
        name: `E2E specialization ${suffix}`,
        sortOrder: 900,
        reason: "Create specialization for catalog browser coverage",
      },
    );
    childId = child.id;
    expect(child.isActive).toBe(true);

    const studentApi = await request.newContext({
      baseURL: process.env.SERVER_URL ?? "http://localhost:3101",
      storageState: ".auth/student.json",
    });
    try {
      for (const [procedure, input] of [
        ["listCompetitionCatalog", { includeArchived: true }],
        [
          "archiveCompetitionCatalogEntry",
          {
            id: child.id,
            expectedVersion: child.version,
            reason: "Student authorization denial coverage",
          },
        ],
      ] as const) {
        const denied = await studentApi.post(`/rpc/admin/${procedure}`, {
          data: { json: input },
        });
        expect(denied.status()).toBe(403);
      }
    } finally {
      await studentApi.dispose();
    }

    await page.goto("/admin-competitions");
    await expect(
      page.getByRole("heading", { name: "Competition types", exact: true }),
    ).toBeVisible();
    const search = page.getByLabel("Search competition catalog");
    await search.fill(childSlug);
    await page.getByRole("button", { name: new RegExp(childSlug) }).click();
    await expect(
      page.getByRole("heading", { name: child.name, exact: true }),
    ).toBeVisible();

    await page.getByText("Availability and deletion", { exact: true }).click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    const archiveDialog = page.getByRole("dialog", {
      name: "Archive catalog entry",
      exact: true,
    });
    await expect(archiveDialog.getByText("Impact preview")).toBeVisible();
    await expect(
      archiveDialog.getByText("0 specializations · 0 references", {
        exact: true,
      }),
    ).toBeVisible();
    await archiveDialog
      .locator("#catalog-action-reason")
      .fill("Verify archive preview and confirmation in the browser");
    await archiveDialog
      .getByRole("button", { name: "Archive", exact: true })
      .click();
    await expect(page.getByText("Catalog entry archived")).toBeVisible();
    expect(
      (
        await adminRpc<CatalogEntry>(adminApi, "getCompetitionCatalogEntry", {
          id: child.id,
        })
      ).isActive,
    ).toBe(false);

    await page.getByRole("button", { name: "Restore", exact: true }).click();
    const restoreDialog = page.getByRole("dialog", {
      name: "Restore catalog entry",
      exact: true,
    });
    await expect(
      restoreDialog.getByText(/Restoring makes this entry available/),
    ).toBeVisible();
    await restoreDialog
      .locator("#catalog-action-reason")
      .fill("Verify restore confirmation in the browser");
    await restoreDialog
      .getByRole("button", { name: "Restore", exact: true })
      .click();
    await expect(page.getByText("Catalog entry restored")).toBeVisible();
    expect(
      (
        await adminRpc<CatalogEntry>(adminApi, "getCompetitionCatalogEntry", {
          id: child.id,
        })
      ).isActive,
    ).toBe(true);

    await page.getByLabel("Close catalog editor").click();
    await search.fill("");
    await page.getByRole("button", { name: new RegExp(childSlug) }).click();
    await page.getByText("Move specialization", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "Destination", exact: true })
      .click();
    await page
      .getByRole("option", { name: destination.name, exact: true })
      .click();
    await page
      .locator("#move-reason")
      .fill("Verify moving an unused specialization in the browser");
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await expect(page.getByText("Specialization moved")).toBeVisible();
    expect(
      (
        await adminRpc<CatalogEntry>(adminApi, "getCompetitionCatalogEntry", {
          id: child.id,
        })
      ).parentId,
    ).toBe(destination.id);

    const movedRow = page.getByRole("button", { name: new RegExp(childSlug) });
    await page.getByLabel("Close catalog editor").click();
    const destinationGroup = movedRow.locator(
      'xpath=ancestor::*[@data-slot="card"]',
    );
    await expect(
      destinationGroup.getByRole("button", {
        name: `Edit competition ${destination.name}`,
        exact: true,
      }),
    ).toBeVisible();
    await movedRow.click();
    await expect(
      page.getByText(`Background: ${destination.lightBackgroundColor}`, {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    try {
      if (childId) {
        await deleteEntry(
          adminApi,
          childId,
          "Clean up catalog browser coverage",
        );
      }
      if (destinationId) {
        await deleteEntry(
          adminApi,
          destinationId,
          "Clean up catalog browser coverage",
        );
      }
    } finally {
      await adminApi.dispose();
    }
  }
});
