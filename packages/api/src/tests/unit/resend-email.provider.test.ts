import { describe, test, expect, mock } from "bun:test";
import { createResendEmailProvider } from "../../modules/email/resend-email.provider";

describe("ResendEmailProvider", () => {
  test("sends email successfully via Resend API", async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      json: async () => ({ id: "re_123" }),
      text: async () => "",
    }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as any;

    const provider = createResendEmailProvider(
      "test-api-key",
      "noreply@example.com",
    );
    const result = await provider.send({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
      category: "booking",
    });

    expect(result).toEqual({ messageId: "re_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://api.resend.com/emails");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.authorization).toBe("Bearer test-api-key");
    expect(call[1].headers["content-type"]).toBe("application/json");

    const body = JSON.parse(call[1].body);
    expect(body.from).toBe("noreply@example.com");
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("Test");
    expect(body.html).toBe("<p>Hello</p>");
    expect(body.tags).toEqual([{ name: "category", value: "booking" }]);

    globalThis.fetch = origFetch;
  });

  test("throws serviceUnavailable when API returns non-ok response", async () => {
    const fetchMock = mock(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server error",
    }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as any;

    const provider = createResendEmailProvider(
      "test-api-key",
      "noreply@example.com",
    );

    await expect(
      provider.send({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
        category: "test",
      }),
    ).rejects.toThrow();

    globalThis.fetch = origFetch;
  });

  test("logs error and re-throws on fetch failure", async () => {
    const fetchMock = mock(async () => {
      throw new Error("Network error");
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as any;

    const provider = createResendEmailProvider(
      "test-api-key",
      "noreply@example.com",
    );

    await expect(
      provider.send({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
        category: "test",
      }),
    ).rejects.toThrow("Network error");

    globalThis.fetch = origFetch;
  });

  test("handles response.text() failure gracefully", async () => {
    const fetchMock = mock(async () => ({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => {
        throw new Error("text parse failed");
      },
    }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as any;

    const provider = createResendEmailProvider(
      "test-api-key",
      "noreply@example.com",
    );

    await expect(
      provider.send({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
        category: "test",
      }),
    ).rejects.toThrow();

    globalThis.fetch = origFetch;
  });

  test("opens the circuit after repeated provider failures", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error("provider unavailable");
    }) as any;

    try {
      const provider = createResendEmailProvider(
        "test-api-key",
        "noreply@example.com",
      );
      const message = {
        to: "user@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
        category: "test",
      };

      for (let attempt = 0; attempt < 3; attempt++) {
        await expect(provider.send(message)).rejects.toThrow(
          "provider unavailable",
        );
      }
      await expect(provider.send(message)).rejects.toThrow(
        "Circuit breaker is open",
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("runs the request timeout callback and still clears the timer", async () => {
    const origFetch = globalThis.fetch;
    const origSetTimeout = globalThis.setTimeout;
    let timeoutCallbacks = 0;
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ id: "re_timeout" }),
      text: async () => "",
    })) as any;
    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback === "function") {
        timeoutCallbacks++;
        callback();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      const provider = createResendEmailProvider(
        "test-api-key",
        "noreply@example.com",
      );
      await expect(
        provider.send({
          to: "user@example.com",
          subject: "Test",
          html: "<p>Hello</p>",
          category: "test",
        }),
      ).resolves.toEqual({ messageId: "re_timeout" });
      expect(timeoutCallbacks).toBe(1);
    } finally {
      globalThis.setTimeout = origSetTimeout;
      globalThis.fetch = origFetch;
    }
  });
});
