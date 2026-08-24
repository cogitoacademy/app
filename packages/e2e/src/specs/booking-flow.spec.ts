import { expect, test, type Page } from "@playwright/test";

const SEED_EMAIL = "student.seed@cogitoacademy.id";
const SEED_PASSWORD = "Student123!";

async function login(page: Page) {
  await page.goto("/login");
  const pathsAfterLoginPage: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      pathsAfterLoginPage.push(new URL(frame.url()).pathname);
    }
  });
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.locator("input#password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("/dashboard");
  expect(pathsAfterLoginPage).not.toContain("/login");
}

test("student can log in and see starting balance", async ({ page }) => {
  await login(page);
  await page.goto("/balance");
  await expect(page.getByText("200").first()).toBeVisible();
  await expect(page.getByText("Ready to spend")).toBeVisible();
});

test("student can book a solo session from tutor discovery", async ({
  page,
}) => {
  await login(page);

  await page.goto("/tutors");
  await expect(
    page.getByRole("heading", { name: "Tutors" }).first(),
  ).toBeVisible();

  const seedTutorCard = page
    .locator('[data-slot="card"]')
    .filter({
      hasText: "Mathematics",
    })
    .first();
  await expect(seedTutorCard).toBeVisible();
  await seedTutorCard.click();

  const drawer = page.locator('[data-slot="drawer-popup"]').first();
  await expect(
    drawer.getByRole("heading", { name: "[seed] Tutor" }),
  ).toBeVisible();

  await drawer.getByRole("button", { name: "Book" }).first().click();
  await expect(page.getByText("Booking requested")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "View my bookings" }).click();

  await page.waitForURL("/bookings");
  const bookingCard = page
    .locator('[data-slot="booking-card"]')
    .filter({
      hasText: "Solo session",
    })
    .first();
  await expect(bookingCard).toBeVisible();
  await expect(bookingCard.getByText("online")).toBeVisible();
});
