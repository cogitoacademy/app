import { describe, test, expect } from "bun:test";
import { buildResetPasswordEmail } from "@cogito-app/auth/reset-password-email";

describe("buildResetPasswordEmail", () => {
  test("includes subject and reset link", () => {
    const { subject, html } = buildResetPasswordEmail({
      name: "Jane Doe",
      url: "http://localhost:3001/reset-password/abc123?callbackURL=http%3A%2F%2Flocalhost%3A3000%2Freset-password",
    });
    expect(subject).toContain("Reset your Cogito Academy password");
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

test("reset link escapes attributes and query delimiters", () => {
  const { html } = buildResetPasswordEmail({
    name: "A & B",
    url: 'https://app.test/reset?token=abc&next="quoted"',
  });
  expect(html).toContain(
    'href="https://app.test/reset?token=abc&amp;next=&quot;quoted&quot;"',
  );
  expect(html).toContain("A &amp; B");
  expect(html).toContain("Cogito Academy");
  expect(html).not.toContain("<img");
});
test("reset rejects executable and invalid link schemes", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com/reset",
    "not a URL",
  ]) {
    expect(() => buildResetPasswordEmail({ name: "A", url })).toThrow();
  }
});
