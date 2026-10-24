import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

for (const signup of [true, false]) {
  test(`${signup ? "signup" : "sign-in"} draft survives background session refresh`, async ({
    page,
  }) => {
    let sessionRequests = 0;
    await page.route("**/api/auth/get-session**", async (route) => {
      sessionRequests++;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ json: null });
    });
    await page.goto("/login");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    if (signup) {
      await page.getByRole("button", { name: "Switch to sign up" }).click();
      await page.getByLabel("Name", { exact: true }).fill("Draft Student");
    }
    await page.getByLabel("Email", { exact: true }).fill("draft@example.test");
    await page.getByLabel("Password", { exact: true }).fill("DemoOnly123!");
    const requestsBefore = sessionRequests;
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect.poll(() => sessionRequests).toBeGreaterThan(requestsBefore);
    // Wait for both the focus refresh and its follow-up session signal request.
    await expect
      .poll(() => sessionRequests)
      .toBeGreaterThan(requestsBefore + 1);
    await page.waitForTimeout(500);
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
      "draft@example.test",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
      "DemoOnly123!",
    );
    if (signup)
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
        "Draft Student",
      );
  });
}
