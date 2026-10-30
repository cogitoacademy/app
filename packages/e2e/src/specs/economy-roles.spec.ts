import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STUDENT_EMAIL,
  STUDENT_NAME,
  STUDENT_PASSWORD,
  TUTOR_EMAIL,
  TUTOR_PASSWORD,
} from "../fixtures/test-accounts";
import { resetE2eAuthRateLimit } from "../fixtures/auth-rate-limit";

async function login(page: Page, email: string, password: string) {
  if (email === STUDENT_EMAIL) {
    await page.goto("/dashboard");
    if (/\/dashboard(?:$|\/)/.test(new URL(page.url()).pathname)) return;
  } else {
    await page.context().clearCookies();
  }
  resetE2eAuthRateLimit();
  await page.goto("/login");
  const pathsAfterLoginPage: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      pathsAfterLoginPage.push(new URL(frame.url()).pathname);
    }
  });
  await page.locator("input#email").fill(email);
  await page.locator("input#password").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(/\/(dashboard|profile)(?:$|\/)/);
  expect(pathsAfterLoginPage).not.toContain("/login");
}

async function expectNumberFieldValue(input: Locator, expected: number) {
  await expect
    .poll(async () => {
      const raw = await input.inputValue();
      return Number(raw.replace(/[^\d-]/g, ""));
    })
    .toBe(expected);
}

async function replaceNumberFieldValue(input: Locator, value: number) {
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.type(String(value));
  await input.press("Tab");
}

async function startEconomyEditing(page: Page) {
  await page
    .getByRole("button", { name: "Edit V3 draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save draft revision", exact: true }),
  ).toBeVisible();
}

test("admin economy sections keep their normal gap across viewports", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  for (const width of [390, 1440]) {
    // eslint-disable-next-line no-await-in-loop -- Resize the shared page before each layout assertion.
    await page.setViewportSize({ width, height: 1000 });
    // eslint-disable-next-line no-await-in-loop -- Each viewport needs a loaded page.
    await page.goto("/admin-economy");
    // eslint-disable-next-line no-await-in-loop -- Wait for the V3 query before measuring.
    await expect(
      page.getByRole("heading", { name: "V3 rate card", exact: true }),
    ).toBeVisible();
    // eslint-disable-next-line no-await-in-loop -- Measure this viewport before resizing again.
    const spacing = await page
      .getByRole("heading", { name: "V3 rate card", exact: true })
      .evaluate((heading) => {
        const grid = heading.closest('[data-slot="card"]')!.parentElement!;
        const styles = window.getComputedStyle(grid);
        return {
          display: styles.display,
          rowGap: styles.rowGap,
          columnGap: styles.columnGap,
        };
      });
    expect(spacing).toEqual({
      display: "grid",
      rowGap: "16px",
      columnGap: "16px",
    });
  }
});

test("student sees closed-loop Marks pricing and cannot open admin economy", async ({
  page,
}) => {
  await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);

  await page.goto("/tutors");
  await expect(
    page.getByRole("heading", { name: "Book a Session", exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Diego by Cogito", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pricing", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table")
      .first()
      .getByRole("columnheader", { name: "Online", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table")
      .first()
      .getByRole("columnheader", { name: "Offline", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/\d+ Marks/).first()).toBeVisible();

  await page.goto("/admin-economy");
  await page.waitForURL("/dashboard");
  await expect(
    page
      .getByRole("heading", {
        name: new RegExp(STUDENT_NAME.split(" ")[0] ?? STUDENT_NAME),
      })
      .first(),
  ).toBeVisible();
});

test("tutor sees IDR honorarium setup without the old Marks cash-out copy", async ({
  page,
}) => {
  await login(page, TUTOR_EMAIL, TUTOR_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard(?:$|\/)/);

  await page.goto("/profile");
  await expect(
    page.getByRole("heading", {
      name: "Keep your profile ready for students",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Honorarium rates", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Online honorarium" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Offline honorarium" }).first(),
  ).toBeVisible();
  const firstHonorariumRow = page
    .getByRole("table")
    .first()
    .getByRole("row")
    .nth(1);
  await expect(firstHonorariumRow.getByRole("cell").nth(0)).toHaveText(
    "1 student",
  );
  await expect(firstHonorariumRow.getByRole("cell").nth(1)).toHaveText(
    /^Rp[\d.]+$/,
  );
  await expect(firstHonorariumRow.getByRole("cell").nth(2)).toHaveText(
    /^Rp[\d.]+$/,
  );
  await expect(page.locator("#tutor-base-rate-online")).toHaveCount(0);
  await expect(page.getByText(/7,000|cash[- ]out/i)).toHaveCount(0);
});

test("admin can save and reload competition-based V3 draft rates", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin-economy");
  await expect(
    page.getByRole("heading", { name: "V3 rate card", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Cogito take schedule", { exact: true }),
  ).toHaveCount(0);
  const amount = page.getByRole("textbox", {
    name: "Model United Nations online solo Marks",
    exact: true,
  });
  await expectNumberFieldValue(amount, 50);
  const original = Number((await amount.inputValue()).replace(/[^\d-]/g, ""));
  try {
    await startEconomyEditing(page);
    await replaceNumberFieldValue(amount, original + 1);
    await page
      .getByLabel("Reason for this revision")
      .fill("E2E V3 rate editing");
    await page
      .getByRole("button", { name: "Save draft revision", exact: true })
      .click();
    await expect(
      page.getByText("V3 draft saved", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expectNumberFieldValue(amount, original + 1);
  } finally {
    await page.goto("/admin-economy");
    await startEconomyEditing(page);
    await replaceNumberFieldValue(amount, original);
    await page
      .getByLabel("Reason for this revision")
      .fill("Restore E2E V3 rate");
    await page
      .getByRole("button", { name: "Save draft revision", exact: true })
      .click();
    await expect(
      page.getByText("V3 draft saved", { exact: true }),
    ).toBeVisible();
  }
});

test("admin blocks negative V3 rates without persisting them", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin-economy");
  const amount = page.getByRole("textbox", {
    name: "Model United Nations online solo Marks",
    exact: true,
  });
  await expectNumberFieldValue(amount, 50);
  await startEconomyEditing(page);
  await replaceNumberFieldValue(amount, -5);
  await page
    .getByLabel("Reason for this revision")
    .fill("Invalid negative rate");
  await expect(
    page.getByRole("button", { name: "Save draft revision", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Cancel and reload", exact: true })
    .click();
  await expectNumberFieldValue(amount, 50);
});
