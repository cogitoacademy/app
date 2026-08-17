import { describe, test, expect, mock } from "bun:test";
import { createEmailService } from "../../modules/email/email.service";

describe("createEmailService", () => {
  test("send delegates to provider", async () => {
    const mockSend = mock(() => Promise.resolve({ messageId: "msg_123" }));
    const provider = { send: mockSend };
    const service = createEmailService(provider);

    const message = {
      to: "test@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      category: "booking" as const,
    };

    const result = await service.send(message);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(message);
    expect(result).toEqual({ messageId: "msg_123" });
  });

  test("accepts the auth category (reset password emails)", async () => {
    const mockSend = mock(() => Promise.resolve({ messageId: "msg_123" }));
    const service = createEmailService({ send: mockSend });

    const result = await service.send({
      to: "user@example.com",
      subject: "Reset your Cogito password",
      html: "<p>Reset link</p>",
      category: "auth",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ messageId: "msg_123" });
  });

  test("send propagates provider errors", async () => {
    const mockSend = mock(() => Promise.reject(new Error("provider error")));
    const provider = { send: mockSend };
    const service = createEmailService(provider);

    await expect(
      service.send({
        to: "test@example.com",
        subject: "Hello",
        html: "<p>Hi</p>",
        category: "booking",
      }),
    ).rejects.toThrow("provider error");
  });
});
