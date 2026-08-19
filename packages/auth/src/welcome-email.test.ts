import { describe, test, expect } from "bun:test";
import { buildWelcomeEmail } from "./welcome-email";

describe("buildWelcomeEmail", () => {
  test("P2: includes onboarding entry point, login link, and a brief intro", () => {
    const { subject, html } = buildWelcomeEmail({
      name: "New Student",
      loginUrl: "http://localhost:3100/login",
    });
    expect(subject).toBe("Welcome to Cogito");
    expect(html).toContain("New Student");
    // onboarding entry point
    expect(html).toContain("dashboard");
    expect(html).toContain("http://localhost:3100/login");
    // brief platform introduction
    expect(html).toContain("book");
  });

  test("P2: escapes HTML in the name and login URL", () => {
    const { html } = buildWelcomeEmail({
      name: "<script>alert(1)</script>",
      loginUrl: "http://localhost:3100/login?x=<b>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });
});
