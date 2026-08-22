import { expect, test, type Page } from "@playwright/test";

const STUDENT_EMAIL = "student.seed@cogitoacademy.id";
const STUDENT_PASSWORD = "Student123!";
const TUTOR_EMAIL = "tutor.seed@cogitoacademy.id";
const TUTOR_PASSWORD = "Tutor123!";
const ADMIN_EMAIL = "admin@cogitoacademy.id";
const ADMIN_PASSWORD = "AdminPassword123!";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("input#email").fill(email);
  await page.locator("input#password").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL(/\/(dashboard|onboarding|admin-tutors)(?:$|\/)/);
}

test("student sees closed-loop Marks pricing and cannot open admin economy", async ({
  page,
}) => {
  await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);

  await page.goto("/tutors");
  await expect(
    page.getByRole("heading", { name: "Tutors", exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText(/Marks/).first()).toBeVisible();

  await page.goto("/admin-economy");
  await page.waitForURL("/dashboard");
  await expect(page.getByText("Student space")).toBeVisible();
});

test("tutor sees IDR honorarium setup without the old Marks cash-out copy", async ({
  page,
}) => {
  await login(page, TUTOR_EMAIL, TUTOR_PASSWORD);

  await page.goto("/onboarding");
  await expect(page.getByText("Base honorarium")).toBeVisible();
  await expect(page.locator("#tutor-base-rate-online")).toHaveValue("175000");
  await expect(page.locator("#tutor-base-rate-offline")).toHaveValue("225000");
  await expect(page.getByText(/7,000|cash[- ]out/i)).toHaveCount(0);
});

test("admin can review and update the future-booking Cogito take schedule", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  await page.goto("/admin-economy");
  await expect(
    page.getByRole("heading", { name: "Economy settings", exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText("Cogito take schedule")).toBeVisible();
  await expect(page.locator("#online-cogito-base")).toHaveValue(/^[0-9]+$/);

  const onlineBaseInput = page.locator("#online-cogito-base");
  const onlineIncrementInput = page.locator("#online-cogito-increment");
  const originalOnlineBase = Number(await onlineBaseInput.inputValue());
  const originalOnlineIncrement = Number(
    await onlineIncrementInput.inputValue(),
  );
  const updatedOnlineBase = originalOnlineBase + 5_000;
  const updatedOnlineIncrement = originalOnlineIncrement + 5_000;

  await onlineBaseInput.fill(String(updatedOnlineBase));
  await onlineIncrementInput.fill(String(updatedOnlineIncrement));
  await page.getByRole("button", { name: "Save take schedule" }).click();
  await expect(page.getByText("Economy settings saved")).toBeVisible();
  await expect(onlineBaseInput).toHaveValue(String(updatedOnlineBase));

  const tutorContext = await page.context().browser()!.newContext();
  const tutorPage = await tutorContext.newPage();
  try {
    await login(tutorPage, TUTOR_EMAIL, TUTOR_PASSWORD);
    await tutorPage.goto("/notifications");
    await expect(
      tutorPage
        .getByRole("heading", { name: "Notifications", exact: true })
        .last(),
    ).toBeVisible();
    await expect(
      tutorPage.getByText("Cogito rate updated", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      tutorPage.getByText(
        `Online: Rp${updatedOnlineBase.toLocaleString("id-ID")} base`,
        { exact: false },
      ),
    ).toBeVisible();
  } finally {
    await tutorContext.close();
  }

  await page.reload();
  await expect(page.locator("#online-cogito-base")).toHaveValue(
    String(updatedOnlineBase),
  );

  // Restore the state that was present before this test.
  await page.locator("#online-cogito-base").fill(String(originalOnlineBase));
  await page
    .locator("#online-cogito-increment")
    .fill(String(originalOnlineIncrement));
  await page.getByRole("button", { name: "Save take schedule" }).click();
  await expect(page.getByText("Economy settings saved")).toBeVisible();
});
