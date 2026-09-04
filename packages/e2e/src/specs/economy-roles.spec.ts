import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
  TUTOR_EMAIL,
  TUTOR_PASSWORD,
} from "../fixtures/test-accounts";

async function login(page: Page, email: string, password: string) {
  if (email === STUDENT_EMAIL) {
    await page.goto("/dashboard");
    if (/\/dashboard(?:$|\/)/.test(new URL(page.url()).pathname)) return;
  } else {
    await page.context().clearCookies();
  }
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

test("student sees closed-loop Marks pricing and cannot open admin economy", async ({
  page,
}) => {
  await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);

  await page.goto("/tutors");
  await expect(
    page.getByRole("heading", { name: "Tutors", exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /From \d+ Marks/ }).first(),
  ).toBeVisible();

  await page.goto("/admin-economy");
  await page.waitForURL("/dashboard");
  await expect(page.getByText("Student space")).toBeVisible();
});

test("tutor sees IDR honorarium setup without the old Marks cash-out copy", async ({
  page,
}) => {
  await login(page, TUTOR_EMAIL, TUTOR_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard(?:$|\/)/);

  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Your tutor profile", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Base honorarium")).toBeVisible();
  await expectNumberFieldValue(
    page.locator("#tutor-base-rate-online"),
    175_000,
  );
  await expectNumberFieldValue(
    page.locator("#tutor-base-rate-offline"),
    225_000,
  );
  await expect(page.getByText(/7,000|cash[- ]out/i)).toHaveCount(0);

  await page.goto("/onboarding");
  await page.waitForURL("/profile");
  await expect(
    page.getByRole("heading", { name: "Your tutor profile", exact: true }),
  ).toBeVisible();
});

test("admin can review and update the future-booking Cogito take schedule", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard(?:$|\/)/);

  await page.goto("/admin-economy");
  await expect(
    page.getByRole("heading", { name: "Economy settings", exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText("Cogito take schedule")).toBeVisible();

  const onlineBaseInput = page.locator("#online-cogito-base");
  const onlineIncrementInput = page.locator("#online-cogito-increment");
  // The page shell renders before the settings query hydrates the controlled
  // fields. Wait for the seeded values before taking the rollback snapshot.
  await expectNumberFieldValue(onlineBaseInput, 50_000);
  await expectNumberFieldValue(onlineIncrementInput, 20_000);
  const originalOnlineBase = Number(
    (await onlineBaseInput.inputValue()).replace(/[^\d-]/g, ""),
  );
  const originalOnlineIncrement = Number(
    (await onlineIncrementInput.inputValue()).replace(/[^\d-]/g, ""),
  );
  const updatedOnlineBase = originalOnlineBase + 5_000;
  const updatedOnlineIncrement = originalOnlineIncrement + 5_000;

  try {
    await replaceNumberFieldValue(onlineBaseInput, updatedOnlineBase);
    await replaceNumberFieldValue(onlineIncrementInput, updatedOnlineIncrement);
    await page.getByRole("button", { name: "Save take schedule" }).click();
    await expect(page.getByText("Economy settings saved")).toBeVisible();
    await expectNumberFieldValue(onlineBaseInput, updatedOnlineBase);

    const tutorContext = await page.context().browser()!.newContext();
    const tutorPage = await tutorContext.newPage();
    try {
      await login(tutorPage, TUTOR_EMAIL, TUTOR_PASSWORD);
      await tutorPage.goto("/notifications");
      await expect(
        tutorPage.getByRole("heading", { name: /All activity/ }),
      ).toBeVisible();
      await expect(
        tutorPage.getByText("Cogito rate updated", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await tutorContext.close();
    }

    await page.reload();
    await expectNumberFieldValue(onlineBaseInput, updatedOnlineBase);
  } finally {
    // Always restore the test database, even when a notification assertion fails.
    await page.goto("/admin-economy");
    await expect(
      page
        .getByRole("heading", { name: "Economy settings", exact: true })
        .last(),
    ).toBeVisible();
    await replaceNumberFieldValue(
      page.locator("#online-cogito-base"),
      originalOnlineBase,
    );
    await replaceNumberFieldValue(
      page.locator("#online-cogito-increment"),
      originalOnlineIncrement,
    );
    await page.getByRole("button", { name: "Save take schedule" }).click();
    await expect(page.getByText("Economy settings saved")).toBeVisible();
  }
});

test("admin blocks a negative economy amount without persisting it", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin-economy");
  await expect(
    page.getByRole("heading", { name: "Economy settings", exact: true }).last(),
  ).toBeVisible();

  const onlineBaseInput = page.locator("#online-cogito-base");
  await expectNumberFieldValue(onlineBaseInput, 50_000);
  await replaceNumberFieldValue(onlineBaseInput, -5_000);
  await page.getByRole("button", { name: "Save take schedule" }).click();

  await expect(
    page.getByText("All amounts must use Rp 5,000 increments.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expectNumberFieldValue(onlineBaseInput, 50_000);
});
