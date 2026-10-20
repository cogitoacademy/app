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
    expect(subject).toBe("Verify your Cogito email");
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
    expect(html).not.toContain("Welcome to Cogito");
  });

  test("escapes the welcome link after signup", () => {
    const { subject, html } = buildSignupWelcomeEmail({
      name: "Student <New>",
      loginUrl: "https://app.test/login?next=<dashboard>",
    });
    expect(subject).toBe("Welcome to Cogito");
    expect(html).toContain("Welcome to Cogito, Student &lt;New&gt;!");
    expect(html).not.toContain("<dashboard>");
    expect(html).toContain("&lt;dashboard&gt;");
  });
});
