import { expect, test, type Page } from "@playwright/test";

import {
  FRIEND_EMAIL,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
  TUTOR_EMAIL,
} from "../fixtures/test-accounts";

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
  const tutorListResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/rpc/tutors/listPublished") &&
      response.request().method() === "POST",
  );
  await login(page);
  await page.goto("/tutors");
  const tutorListResponse = await tutorListResponsePromise;
  expect(await tutorListResponse.text()).not.toContain(TUTOR_EMAIL);

  const seedTutorCard = page
    .getByRole("button", { name: /\[seed\] Tutor/ })
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
