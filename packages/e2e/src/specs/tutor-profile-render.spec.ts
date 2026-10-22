import { expect, test } from "@playwright/test";

// Rendering coverage uses synthetic responses and never seeds or writes a database.
test("tutor profile renders the tax introduction and editable identity fields", async ({
  page,
}) => {
  const user = {
    id: "profile-render-tutor",
    name: "Profile Tutor",
    email: "profile-render@example.test",
    emailVerified: true,
    image: null,
    role: "tutor",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        user,
        session: {
          id: "profile-render-session",
          userId: user.id,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    }),
  );
  await page.route("**/rpc/**", (route) => {
    const isProfile =
      new URL(route.request().url()).pathname === "/rpc/tutor/getMyProfile";
    return route.fulfill({
      json: {
        json: isProfile
          ? {
              id: "profile-render-fixture",
              onboardingStatus: "draft",
              user,
              subjects: [],
              prices: {},
              pendingProfileChanges: null,
            }
          : route.request().url().includes("/notification/")
            ? { items: [], count: 0 }
            : [],
        meta: [],
      },
    });
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/profile");
  await expect(
    page.getByText("Tax identity for payouts", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Legal name", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Complete your legal name and 16-digit NIK before a new payout is prepared.",
      { exact: false },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
