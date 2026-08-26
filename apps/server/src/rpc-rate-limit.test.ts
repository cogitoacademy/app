import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { matchAuthPath, matchRateLimitPath } from "./rate-limit-paths";

describe("matchRateLimitPath maps real slash-key RPC URLs", () => {
  test("payment.createPurchase matches /rpc/payment/createPurchase", () => {
    expect(matchRateLimitPath("/rpc/payment/createPurchase")).toBe("payment");
  });

  test("dotted /rpc/payment.createPurchase does not match (regression R1)", () => {
    expect(matchRateLimitPath("/rpc/payment.createPurchase")).toBeNull();
  });

  test("invite verify matches /rpc/invite/verify", () => {
    expect(matchRateLimitPath("/rpc/invite/verify")).toBe("invite");
  });

  test("booking procedures match /rpc/booking/*", () => {
    expect(matchRateLimitPath("/rpc/booking/listMine")).toBe("booking");
    expect(matchRateLimitPath("/rpc/booking/create")).toBe("booking");
  });

  test("student search matches /rpc/auth/searchStudents", () => {
    expect(matchRateLimitPath("/rpc/auth/searchStudents")).toBe("search");
    expect(matchRateLimitPath("/rpc/auth/searchStudents?q=x")).toBe("search");
  });

  test("support ticket creation matches /rpc/support/createTicket (M3)", () => {
    expect(matchRateLimitPath("/rpc/support/createTicket")).toBe("support");
    expect(matchRateLimitPath("/rpc/support/listTickets")).toBeNull();
  });

  test("achievement submission matches /rpc/achievement/create (M3)", () => {
    expect(matchRateLimitPath("/rpc/achievement/create")).toBe("achievement");
    expect(matchRateLimitPath("/rpc/achievement/list")).toBeNull();
    expect(matchRateLimitPath("/rpc/achievement/listApproved")).toBeNull();
  });

  test("upload URL creation matches /rpc/upload/createUploadUrl (M3)", () => {
    expect(matchRateLimitPath("/rpc/upload/createUploadUrl")).toBe("upload");
  });

  test("content file proxy matches /content/student-resources/*", () => {
    expect(matchRateLimitPath("/content/student-resources/abc123/file")).toBe(
      "content",
    );
    expect(
      matchRateLimitPath("/content/student-resources/abc123/file?x=1"),
    ).toBe("content");
    expect(matchRateLimitPath("/content/competitions")).toBeNull();
  });

  test("email-otp / forget-password / change-email paths are auth-limited (M3)", () => {
    expect(matchAuthPath("/api/auth/email-otp/verify-email")).toBe(true);
    expect(matchAuthPath("/api/auth/email-otp/send-otp")).toBe(true);
    expect(matchAuthPath("/api/auth/forget-password/email")).toBe(true);
    expect(matchAuthPath("/api/auth/change-email/email")).toBe(true);
  });

  test("better-auth exact endpoints without trailing slashes are auth-limited (S4)", () => {
    // better-auth registers these WITHOUT trailing segments — a literal
    // `path.startsWith("/api/auth/request-password-reset/")` prefix would
    // miss them and leave password-reset brute force unthrottled.
    expect(matchAuthPath("/api/auth/request-password-reset")).toBe(true);
    expect(matchAuthPath("/api/auth/reset-password")).toBe(true);
    expect(matchAuthPath("/api/auth/sign-in/email")).toBe(true);
    expect(matchAuthPath("/api/auth/sign-up/email")).toBe(true);
    expect(matchAuthPath("/api/auth/change-email")).toBe(true);
    expect(matchAuthPath("/api/auth/sign-in/social")).toBe(true);
  });

  test("other paths are not rate limited", () => {
    expect(matchRateLimitPath("/rpc/wallet/getBalance")).toBeNull();
    expect(matchRateLimitPath("/health")).toBeNull();
  });
});

describe("routes.ts uses the slash-key patterns", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf-8");

  test("rate-limit hook delegates to matchRateLimitPath", () => {
    expect(routes).toContain("matchRateLimitPath");
    expect(routes).not.toContain('path === "/rpc/payment.createPurchase"');
    expect(routes).not.toContain('path.startsWith("/rpc/invite.verify")');
    expect(routes).not.toContain('path.startsWith("/rpc/booking.")');
    expect(routes).not.toContain(
      'path.startsWith("/rpc/auth.students/search")',
    );
  });
});
