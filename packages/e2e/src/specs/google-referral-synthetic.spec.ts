import { expect, test } from "@playwright/test";
// UI/wire only: backend decisions are synthetic, never database/provider proof.
for (const code of ["FRIEND ABC123", "LEGACYKOL", null]) {
  test(`new Google student chooses ${code ?? "no-code"} and resumes destination`, async ({
    page,
  }) => {
    let pending = true;
    const saved: unknown[] = [];
    const fresh: boolean[] = [];
    await page.route("http://localhost:3321/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/get-session") {
        const authoritative =
          url.searchParams.get("disableCookieCache") === "true";
        fresh.push(authoritative);
        return route.fulfill({
          json: {
            user: {
              id: "synthetic",
              name: "New Student",
              email: "new@example.test",
              emailVerified: true,
              role: "student",
              referralChoicePending: authoritative ? pending : true,
            },
            session: {
              id: "synthetic",
              userId: "synthetic",
              expiresAt: "2099-01-01T00:00:00Z",
            },
          },
        });
      }
      if (url.pathname === "/rpc/referral/saveGoogleChoice") {
        const input = route.request().postDataJSON().json;
        saved.push(input.code);
        if (input.code === "INVALID")
          return route.fulfill({
            status: 400,
            json: {
              json: {
                defined: true,
                code: "BAD_REQUEST",
                status: 400,
                message: "Invalid referral code",
              },
            },
          });
        pending = false;
        return route.fulfill({ json: { json: { id: "choice" } } });
      }
      return route.fulfill({ json: { json: [] } });
    });
    await page.goto("/auth/callback?redirect=%2Ffaq&authOutcome=created");
    await expect(
      page.getByRole("heading", { name: "Choose a referral option" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/referral-choice.*redirect=%2Ffaq/);
    await page.reload();
    await expect(
      page.getByLabel("Referral code", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Referral code", { exact: true }).press("Enter");
    expect(saved).toEqual([]);
    await page.getByLabel("Referral code", { exact: true }).fill("INVALID");
    await page.getByLabel("Referral code", { exact: true }).press("Enter");
    await expect(
      page.getByText("Invalid referral code", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Couldn't save referral choice", { exact: true }),
    ).toBeVisible();
    expect(pending).toBe(true);
    await expect(page).toHaveURL(/referral-choice/);
    if (code) {
      await page.getByLabel("Referral code", { exact: true }).fill(code);
      await page.getByLabel("Referral code", { exact: true }).press("Enter");
    } else
      await page
        .getByRole("button", { name: "No referral code", exact: true })
        .click();
    await expect(page).toHaveURL("http://localhost:3320/faq");
    expect(saved).toEqual(["INVALID", code]);
    expect(pending).toBe(false);
    expect(fresh.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    await page.reload();
    await expect(page).toHaveURL("http://localhost:3320/faq");
  });
}
