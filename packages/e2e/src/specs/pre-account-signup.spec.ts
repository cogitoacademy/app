import { expect, test } from "@playwright/test";

import { createPreAccountSignupFixture } from "../fixtures/pre-account-signup";

test("public signup requires the email OTP before creating an account", async ({
  page,
}) => {
  const fixture = await createPreAccountSignupFixture();
  const password = "SignupTest123!";
  try {
    const rawSignup = {
      email: fixture.email,
      password,
      name: "Signup E2E",
    };
    const canonicalBypass = await fixture.api.post("/api/auth/sign-up/email", {
      data: rawSignup,
    });
    expect(canonicalBypass.status()).toBe(400);

    const bypassPaths = [
      "/api/auth/sign-up%2FEMAIL/",
      "/api/auth/sign-up%252Femail",
      "/API/AUTH/SIGN-UP/EMAIL",
    ];
    const bypassResponses = await Promise.all(
      bypassPaths.map((path) =>
        fixture.api.post(path, { data: rawSignup }),
      ),
    );
    for (const [index, bypass] of bypassResponses.entries()) {
      expect(
        bypass.status(),
        `signup bypass via ${bypassPaths[index]}`,
      ).toBeGreaterThanOrEqual(400);
      expect(bypass.status(), `signup bypass via ${bypassPaths[index]}`).toBeLessThan(500);
    }
    const unsupportedMethod = await fixture.api.put("/api/auth/sign-up/email", {
      data: rawSignup,
    });
    expect(unsupportedMethod.status()).toBe(405);

    await page.context().clearCookies();
    await page.goto("/login");
    await page
      .getByRole("button", { name: "Switch to sign up", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill("Signup E2E");
    const emailInput = page.getByLabel("Email", { exact: true });
    await emailInput.fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill(password);

    const otpInput = page.getByLabel("Email verification code", {
      exact: true,
    });
    await expect(otpInput).toHaveValue("");
    const sendCode = page.getByRole("button", {
      name: "Send code",
      exact: true,
    });
    await expect(sendCode).toBeVisible();
    const firstSend = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/sign-up/email-otp") &&
        response.request().method() === "POST",
    );
    await sendCode.click();
    const firstSendResponse = await firstSend;
    const firstSendBody = (await firstSendResponse.json()) as {
      signupAttemptId?: string;
    };
    expect(firstSendResponse.ok()).toBe(true);
    expect(firstSendBody.signupAttemptId).toBeTruthy();

    // Editing the address clears the entered proof and makes the user request
    // a code for the newly selected address before submit.
    await emailInput.fill(`changed.${fixture.email}`);
    await expect(otpInput).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Send code", exact: true }),
    ).toBeVisible();
    await emailInput.fill(fixture.email);
    await expect(otpInput).toHaveValue("");

    // The server retains the original code during its cooldown and returns
    // its bound attempt ID, so a browser can recover after editing the field.
    const cooldownSend = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/sign-up/email-otp") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    const cooldownResponse = await cooldownSend;
    expect(cooldownResponse.status()).toBe(429);
    const cooldownBody = (await cooldownResponse.json()) as {
      signupAttemptId?: string;
    };
    expect(cooldownBody.signupAttemptId).toBe(firstSendBody.signupAttemptId);

    await expect(
      page.getByRole("button", { name: /Resend in/ }),
    ).toBeDisabled();
    const otp = await fixture.readOtp();
    const wrongOtp = otp === "000000" ? "000001" : "000000";
    await otpInput.fill(wrongOtp);
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "The code is incorrect or no longer valid.",
    );
    await expect(page).toHaveURL(/\/login$/);

    await otpInput.fill(otp);
    const dashboardWalletResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/rpc/wallet/get"),
    );
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    const dashboardWalletResponse = await dashboardWalletResponsePromise;
    expect(await dashboardWalletResponse.json()).toHaveProperty(
      "json.totalBalance",
    );
  } finally {
    try {
      fixture.cleanup();
    } finally {
      await fixture.api.dispose();
    }
  }
});

test("checks the committed outcome when the signup response is lost", async ({
  page,
}) => {
  const fixture = await createPreAccountSignupFixture();
  const password = "SignupTest123!";
  try {
    await page.context().clearCookies();
    await page.goto("/login");
    await page
      .getByRole("button", { name: "Switch to sign up", exact: true })
      .click();
    await page.getByRole("heading", { name: "Create your account" }).waitFor();
    await page.getByLabel("Name", { exact: true }).fill("Signup Recovery E2E");
    await page.getByLabel("Email", { exact: true }).fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill(password);

    const sendResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/sign-up/email-otp") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    const sendResponse = await sendResponsePromise;
    expect(sendResponse.ok()).toBe(true);
    const sendBody = (await sendResponse.json()) as {
      signupAttemptId?: string;
    };
    expect(sendBody.signupAttemptId).toBeTruthy();

    const otp = await fixture.readOtp();
    await page.getByLabel("Email verification code", { exact: true }).fill(otp);
    const outcomeResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/sign-up/email-outcome") &&
        response.request().method() === "POST",
    );
    await page.route("**/api/auth/sign-up/email", async (route) => {
      const signupResponse = await route.fetch();
      expect(signupResponse.status()).toBe(200);
      await route.abort("connectionreset");
    });
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Your account was created, but this browser did not receive a session. Sign in to continue.",
    );
    const outcomeResponse = await outcomeResponsePromise;
    expect(outcomeResponse.ok()).toBe(true);
    expect(await outcomeResponse.json()).toEqual({ created: true });
    await expect(
      page.getByRole("button", { name: "Sign in to continue" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign Up", exact: true }),
    ).toBeDisabled();
  } finally {
    try {
      fixture.cleanup();
    } finally {
      await fixture.api.dispose();
    }
  }
});
