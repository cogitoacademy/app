import { describe, test, expect } from "bun:test";
import {
  buildSignupWelcomeEmail,
  buildVerificationEmail,
} from "./verification-email";

describe("buildVerificationEmail", () => {
  test("includes the OTP and expiry in the subject and body", () => {
    const { subject, html } = buildVerificationEmail({
      name: "Student",
      otp: "123456",
      expiresInMinutes: 5,
    });
    expect(subject).toBe("Verify your Cogito Academy email");
    expect(html).toContain("123456");
    expect(html).toContain("5 minutes");
    expect(html).toContain("Student");
  });

  test("escapes HTML in the name and OTP", () => {
    const { html } = buildVerificationEmail({
      name: "<script>alert(1)</script>",
      otp: "<b>123456</b>",
      expiresInMinutes: 5,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>123456</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;");
  });

  test("does not include welcome copy before an account exists", () => {
    const { html } = buildVerificationEmail({
      name: "Student",
      otp: "123456",
      expiresInMinutes: 5,
    });
    expect(html).not.toContain("Welcome to Cogito Academy");
  });

  test("escapes the welcome link after signup", () => {
    const { subject, html } = buildSignupWelcomeEmail({
      name: "Student <New>",
      loginUrl: "https://app.test/login?next=<dashboard>",
    });
    expect(subject).toBe("Welcome to Cogito Academy");
    expect(html).toContain("Welcome to Cogito Academy, Student &lt;New&gt;!");
    expect(html).not.toContain("<dashboard>");
    expect(html).toContain("&lt;dashboard&gt;");
  });
});

test("all auth templates retain fallback branding without a configured banner", () => {
  for (const html of [
    buildVerificationEmail({
      name: "Student",
      otp: "123456",
      expiresInMinutes: 5,
    }).html,
    buildSignupWelcomeEmail({
      name: "Student",
      loginUrl: "http://localhost:3000/login?a=1&b=2",
    }).html,
  ]) {
    expect(html).toContain("Cogito Academy");
    expect(html).toContain('name="viewport"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("oklch(");
  }
});
test("welcome links preserve local URLs and escape attribute injection", () => {
  const { html } = buildSignupWelcomeEmail({
    name: "A",
    loginUrl: 'http://localhost:3000/login?a=1&b="quoted"',
  });
  expect(html).toContain(
    'href="http://localhost:3000/login?a=1&amp;b=&quot;quoted&quot;"',
  );
});
test("welcome rejects executable and invalid link schemes", () => {
  for (const loginUrl of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com/login",
    "not a URL",
  ]) {
    expect(() => buildSignupWelcomeEmail({ name: "A", loginUrl })).toThrow();
  }
});

test("all three builders use the escaped public banner and reject unsafe headers", async () => {
  const { buildResetPasswordEmail } = await import("./reset-password-email");
  const builders = [
    (headerUrl: string) =>
      buildVerificationEmail({
        name: "A",
        otp: "123456",
        expiresInMinutes: 5,
        headerUrl,
      }),
    (headerUrl: string) =>
      buildSignupWelcomeEmail({
        name: "A",
        loginUrl: "https://app.test/login",
        headerUrl,
      }),
    (headerUrl: string) =>
      buildResetPasswordEmail({
        name: "A",
        url: "https://app.test/reset",
        headerUrl,
      }),
  ];
  for (const build of builders) {
    const { subject, html } = build(
      'https://app.test/auth-email-header.png?a=1&b="two"',
    );
    expect(subject).toContain("Cogito Academy");
    expect(html).toContain('src="cid:cogito-auth-header"');
    expect(html).toContain('alt="Cogito Academy"');
    expect(html).not.toContain("#9751c1");
    expect(html).not.toContain("border-bottom:3px");
    expect(html).not.toMatch(/Cogito(?! Academy)/);
    for (const headerUrl of [
      "javascript:alert(1)",
      "data:image/png;base64,abc",
      "//app.test/header.png",
    ]) {
      expect(() => build(headerUrl)).toThrow();
    }
  }
});
