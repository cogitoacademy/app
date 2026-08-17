import { describe, test, expect } from "bun:test";
import { buildResetPasswordEmail } from "@cogito-app/auth/reset-password-email";

describe("buildResetPasswordEmail", () => {
  test("includes subject and reset link", () => {
    const { subject, html } = buildResetPasswordEmail({
      name: "Jane Doe",
      url: "http://localhost:3001/reset-password/abc123?callbackURL=http%3A%2F%2Flocalhost%3A3000%2Freset-password",
    });
    expect(subject).toContain("Reset your Cogito password");
    expect(html).toContain("http://localhost:3001/reset-password/abc123");
  });

  test("escapes the user name in html", () => {
    const { html } = buildResetPasswordEmail({
      name: `<script>alert("x")</script>`,
      url: "http://localhost:3001/reset-password/tok",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;x&quot;");
  });

  test("mentions the 1 hour expiry", () => {
    const { html } = buildResetPasswordEmail({
      name: "Jane",
      url: "http://localhost:3001/reset-password/tok",
    });
    expect(html).toContain("expires in 1 hour");
  });
});
