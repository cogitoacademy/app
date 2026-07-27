import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { createResendEmailProvider } from "../../modules/email/resend-email.provider";

const originalFetch = globalThis.fetch;

describe("ResendEmailProvider", () => {
  beforeEach(() => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "re_123" }),
      text: async () => "",
    })) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch as any;
  });

  test("sends email via Resend API and returns messageId", async () => {
    const provider = createResendEmailProvider(
      "re_test_key",
      "noreply@test.com",
    );

    const result = await provider.send({
      to: "user@test.com",
      subject: "Booking confirmed",
      html: "<p>Your booking is confirmed</p>",
      category: "booking",
    });

    expect(result).toEqual({ messageId: "re_123" });

    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://api.resend.com/emails");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.authorization).toBe("Bearer re_test_key");

    const body = JSON.parse(call[1].body);
    expect(body.to).toEqual(["user@test.com"]);
    expect(body.subject).toBe("Booking confirmed");
    expect(body.html).toBe("<p>Your booking is confirmed</p>");
  });

  test("includes category as tag in request body", async () => {
    const provider = createResendEmailProvider(
      "re_test_key",
      "noreply@test.com",
    );

    await provider.send({
      to: "user@test.com",
      subject: "Refund processed",
      html: "<p>Refund done</p>",
      category: "refund",
    });

    const call = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.tags).toEqual([{ name: "category", value: "refund" }]);
  });

  test("throws on API error response", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 422,
      text: async () => "Validation error",
      json: async () => ({}),
    })) as any;

    const provider = createResendEmailProvider(
      "re_test_key",
      "noreply@test.com",
    );

    try {
      await provider.send({
        to: "user@test.com",
        subject: "Test",
        html: "<p>Test</p>",
        category: "booking",
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("422");
    }
  });

  test("logs and re-throws when fetch throws a network error", async () => {
    const networkError = new TypeError("fetch failed");
    globalThis.fetch = mock(() => {
      throw networkError;
    }) as any;

    const consoleErrorSpy = mock(() => {});
    const originalConsoleError = console.error;
    console.error = consoleErrorSpy;

    const provider = createResendEmailProvider(
      "re_test_key",
      "noreply@test.com",
    );

    try {
      await provider.send({
        to: "user@test.com",
        subject: "Test",
        html: "<p>Test</p>",
        category: "booking",
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBe(networkError);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedEntry.level).toBe("error");
      expect(loggedEntry.action).toBe("resend_email_send_failed");
      expect(loggedEntry.error.message).toContain("fetch failed");
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("aborts fetch after timeout and propagates AbortError", async () => {
    const abortError = new DOMException(
      "The operation was aborted.",
      "AbortError",
    );
    globalThis.fetch = mock(async () => {
      throw abortError;
    }) as any;

    const consoleErrorSpy = mock(() => {});
    const originalConsoleError = console.error;
    console.error = consoleErrorSpy;

    const provider = createResendEmailProvider(
      "re_test_key",
      "noreply@test.com",
    );

    try {
      await provider.send({
        to: "user@test.com",
        subject: "Test",
        html: "<p>Test</p>",
        category: "booking",
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBe(abortError);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedEntry.action).toBe("resend_email_send_failed");
      expect(loggedEntry.error.message).toContain("aborted");
    } finally {
      console.error = originalConsoleError;
    }
  });
});
