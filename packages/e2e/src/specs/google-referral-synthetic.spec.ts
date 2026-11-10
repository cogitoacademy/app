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
        expect(input.consent).toEqual({
          termsAccepted: true,
          termsVersion: "2026-11",
          ageGroup: "adult",
        });
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
    await page.getByRole("radio", { name: "I am 18 or older." }).click();
    await page
      .getByRole("checkbox", {
        name: /I have read, understood and agree to the student terms/,
      })
      .check();
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

test("signup shows both terms and requires guardian consent for minors", async ({
  page,
}) => {
  await page.route("http://localhost:3321/**", (route) =>
    route.fulfill({ json: null }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Switch to sign up" }).click();
  const google = page.getByRole("button", { name: "Sign up with Google" });
  await expect(google).toBeDisabled();
  await page
    .getByRole("button", { name: "Read student terms and conditions" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(
        "Pasal 19: Hukum Yang Berlaku, Penyelesaian Sengketa, Dan Bahasa",
      ),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page
    .getByRole("button", { name: "Read tutor terms of service" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Clause 14: Governing Law, Disputes And Language"),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.getByRole("radio", { name: "I am under 18." }).click();
  await page
    .getByRole("checkbox", {
      name: /I have read, understood and agree to the student terms/,
    })
    .check();
  await expect(google).toBeDisabled();
  await page.getByLabel("Parent/guardian’s full name").fill("Parent Example");
  await page.getByLabel("Relationship to the student").click();
  await page.getByRole("option", { name: "Mother" }).click();
  await expect(google).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /To be ticked by the parent\/guardian/ })
    .check();
  await expect(google).toBeEnabled();
});
