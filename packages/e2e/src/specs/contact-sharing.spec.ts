import { expect, test, type Page } from "@playwright/test";

const STUDENT_EMAIL = "student.seed@cogitoacademy.id";
const STUDENT_PASSWORD = "Student123!";
const TUTOR_EMAIL = "tutor.seed@cogitoacademy.id";
const FRIEND_EMAIL = "student.friend1.seed@cogitoacademy.id";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(STUDENT_EMAIL);
  await page.locator("input#password").fill(STUDENT_PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("/dashboard");
}

test("student identity surfaces never expose tutor or invitee email", async ({
  page,
}) => {
  await login(page);

  const tutorListResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/rpc/tutors/list") &&
      response.request().method() === "POST",
  );
  await page.goto("/tutors");
  const tutorListResponse = await tutorListResponsePromise;
  expect(await tutorListResponse.text()).not.toContain(TUTOR_EMAIL);

  const seedTutorCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Mathematics" })
    .first();
  await expect(seedTutorCard).toBeVisible();
  await seedTutorCard.click();

  const drawer = page.locator('[data-slot="drawer-popup"]').first();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: /Book/ }).click();
  await page.waitForURL(/\/tutors\/[^/]+\/book/);

  const studentSearchResponsePromise = page.waitForResponse(
    (response) =>
      (response.url().includes("/rpc/auth/students/search") ||
        response.url().includes("/rpc/auth/searchStudents")) &&
      response.request().method() === "POST",
  );
  await page.getByLabel("Find a student").fill(FRIEND_EMAIL);
  const studentSearchResponse = await studentSearchResponsePromise;
  expect(await studentSearchResponse.text()).not.toContain(FRIEND_EMAIL);

  await expect(
    page.getByText("[seed] Alya Friend", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(FRIEND_EMAIL);
});
