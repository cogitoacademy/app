import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { rateLimit, resetRateLimitStore } from "@cogito-app/api/lib/rate-limit";

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

  test("booking mutations match /rpc/booking/*", () => {
    expect(matchRateLimitPath("/rpc/booking/createSolo")).toBe("booking");
    expect(matchRateLimitPath("/rpc/booking/cancel")).toBe("booking");
  });

  test("booking detail/list reads are not in the mutation bucket", () => {
    for (const path of [
      "/rpc/booking/get",
      "/rpc/booking/getRescheduleAvailability",
      "/rpc/booking/getSessionNotes",
      "/rpc/booking/listMine",
      "/rpc/booking/listSessions",
    ]) {
      expect(matchRateLimitPath(path)).toBeNull();
    }
  });

  test("student search matches the actual slash-key RPC path", () => {
    expect(matchRateLimitPath("/rpc/auth/students/search")).toBe("search");
    expect(matchRateLimitPath("/rpc/auth/students/search?q=x")).toBe("search");
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

  test("content file proxy matches /content/knowledge-bank/*", () => {
    expect(matchRateLimitPath("/content/knowledge-bank/abc123/file")).toBe(
      "content",
    );
    expect(matchRateLimitPath("/content/knowledge-bank/abc123/file?x=1")).toBe(
      "content",
    );
    expect(matchRateLimitPath("/content/competitions")).toBeNull();
  });

  test("student report export endpoints share the reportExport bucket", () => {
    expect(matchRateLimitPath("/reports/student/summary")).toBe("reportExport");
    expect(matchRateLimitPath("/reports/student/pdf")).toBe("reportExport");
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

  test("encoded auth signup paths share the same per-IP auth budget", async () => {
    const paths = [
      "/api/auth/sign-up/email-otp",
      "/api/auth/sign-up%2Femail-otp",
      "/api/auth/sign-up%252Femail-otp",
      "/API/AUTH/SIGN-UP/EMAIL-OTP",
      "/api/auth/sign-up/email-otp///",
    ];
    const authLimiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 10,
      keyPrefix: "auth",
    });
    const ip = "198.51.100.42";

    resetRateLimitStore();
    try {
      for (let index = 0; index < 10; index += 1) {
        const path = paths[index % paths.length]!;
        expect(matchAuthPath(path), path).toBe(true);
        // eslint-disable-next-line no-await-in-loop -- Preserve one ordered IP budget.
        expect((await authLimiter(ip)).allowed, path).toBe(true);
      }
      expect(matchAuthPath(paths[0]!)).toBe(true);
      expect((await authLimiter(ip)).allowed).toBe(false);
    } finally {
      resetRateLimitStore();
    }
  });

  test("malformed or excessively encoded auth paths fail closed for limiting", () => {
    expect(matchAuthPath("/api/auth/sign-up%ZZ")).toBe(true);
    expect(matchAuthPath(`/api/auth/${"%25252525".repeat(12)}sign-up`)).toBe(
      true,
    );
  });

  test("other paths are not rate limited", () => {
    expect(matchRateLimitPath("/rpc/wallet/getBalance")).toBeNull();
    expect(matchRateLimitPath("/health")).toBeNull();
  });
});

describe("routes/rate-limits.ts uses the slash-key patterns", () => {
  const routes = readFileSync(
    new URL("./routes/rate-limits.ts", import.meta.url),
    "utf-8",
  );

  test("rate-limit hook delegates to matchRateLimitPath", () => {
    expect(routes).toContain("matchRateLimitPath");
    expect(routes).not.toContain('path === "/rpc/payment.createPurchase"');
    expect(routes).not.toContain('path.startsWith("/rpc/invite.verify")');
    expect(routes).not.toContain('path.startsWith("/rpc/booking.")');
    expect(routes).not.toContain(
      'path.startsWith("/rpc/auth.students/search")',
    );
  });

  test("all matched auth paths use one ten-per-minute IP bucket", () => {
    expect(routes).toContain("auth: { windowMs: 60_000, maxRequests: 10 }");
    expect(routes).toContain('limiters.get("auth")!(ip)');
    expect(routes).toContain("if (matchAuthPath(path))");
  });
});
