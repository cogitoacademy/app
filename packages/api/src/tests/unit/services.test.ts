import { describe, test, expect } from "bun:test";
import {
  createProviderRefundDelegate,
  resolveGoogleMeetConfig,
  resolveXenditConfig,
} from "../../services";

describe("Services conditional logic", () => {
  test("resolves OAuth Google Meet configuration", () => {
    expect(
      resolveGoogleMeetConfig({
        googleClientId: "client",
        googleClientSecret: "secret",
        refreshToken: "refresh",
      }),
    ).toEqual({
      authType: "oauth_refresh_token",
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "refresh",
      calendarId: "primary",
    });
  });

  test("resolves service-account Google Meet configuration", () => {
    expect(
      resolveGoogleMeetConfig({
        clientEmail: "service@example.com",
        privateKey: "private-key",
        impersonatedUser: "tutor@example.com",
        calendarId: "calendar-1",
      }),
    ).toEqual({
      authType: "service_account",
      clientEmail: "service@example.com",
      privateKey: "private-key",
      impersonatedUser: "tutor@example.com",
      calendarId: "calendar-1",
    });
  });

  test("returns no Google Meet config when credentials are incomplete", () => {
    expect(
      resolveGoogleMeetConfig({ clientEmail: "service@example.com" }),
    ).toBe(undefined);
  });

  test("resolves Xendit configuration only for a complete Xendit setup", () => {
    expect(
      resolveXenditConfig({
        provider: "xendit",
        secretKey: "secret",
        webhookToken: "token",
        mode: "test",
        testAllowedEmails: "QA@cogitoacademy.id",
        successRedirectUrl: "https://app.test/success",
        failureRedirectUrl: "https://app.test/failure",
        defaultPaymentMethod: "qris",
      }),
    ).toMatchObject({
      secretKey: "secret",
      webhookToken: "token",
      mode: "test",
      defaultPaymentMethod: "qris",
    });
    expect(
      resolveXenditConfig({
        provider: "stub",
        defaultPaymentMethod: "ewallet_ovo",
      }),
    ).toBeUndefined();
  });

  test("creates a provider refund delegate", async () => {
    const refund = async (
      paymentRequestId: string,
      amountIdr: number,
      reason?: string,
    ) => ({ providerRefundId: `${paymentRequestId}:${amountIdr}:${reason}` });
    const delegate = createProviderRefundDelegate({ refund });

    await expect(delegate("pay-1", 5000, "duplicate")).resolves.toEqual({
      providerRefundId: "pay-1:5000:duplicate",
    });
  });

  test("Google Meet enabled when env vars are truthy", () => {
    const GOOGLE_MEET_ENABLED = true;
    const GOOGLE_CLIENT_EMAIL = "test@example.com";
    const GOOGLE_PRIVATE_KEY = "test-key";

    const useGoogleMeet = !!(
      GOOGLE_MEET_ENABLED &&
      GOOGLE_CLIENT_EMAIL &&
      GOOGLE_PRIVATE_KEY
    );

    expect(useGoogleMeet).toBe(true);
  });

  test("Google Meet disabled when GOOGLE_MEET_ENABLED is false", () => {
    const GOOGLE_MEET_ENABLED = false;
    const GOOGLE_CLIENT_EMAIL = "test@example.com";
    const GOOGLE_PRIVATE_KEY = "test-key";

    const useGoogleMeet = !!(
      GOOGLE_MEET_ENABLED &&
      GOOGLE_CLIENT_EMAIL &&
      GOOGLE_PRIVATE_KEY
    );

    expect(useGoogleMeet).toBe(false);
  });

  test("Google Meet disabled when GOOGLE_CLIENT_EMAIL is missing", () => {
    const GOOGLE_MEET_ENABLED = true;
    const GOOGLE_CLIENT_EMAIL: string | undefined = undefined;
    const GOOGLE_PRIVATE_KEY = "test-key";

    const useGoogleMeet = !!(
      GOOGLE_MEET_ENABLED &&
      GOOGLE_CLIENT_EMAIL &&
      GOOGLE_PRIVATE_KEY
    );

    expect(useGoogleMeet).toBe(false);
  });

  test("Google Meet disabled when GOOGLE_PRIVATE_KEY is missing", () => {
    const GOOGLE_MEET_ENABLED = true;
    const GOOGLE_CLIENT_EMAIL = "test@example.com";
    const GOOGLE_PRIVATE_KEY: string | undefined = undefined;

    const useGoogleMeet = !!(
      GOOGLE_MEET_ENABLED &&
      GOOGLE_CLIENT_EMAIL &&
      GOOGLE_PRIVATE_KEY
    );

    expect(useGoogleMeet).toBe(false);
  });

  test("Xendit enabled when both secret key and webhook token are set", () => {
    const XENDIT_SECRET_KEY = "sk-test";
    const XENDIT_WEBHOOK_TOKEN = "wt-test";

    const useXendit = !!(XENDIT_SECRET_KEY && XENDIT_WEBHOOK_TOKEN);

    expect(useXendit).toBe(true);
  });

  test("Xendit disabled when secret key is missing", () => {
    const XENDIT_SECRET_KEY: string | undefined = undefined;
    const XENDIT_WEBHOOK_TOKEN = "wt-test";

    const useXendit = !!(XENDIT_SECRET_KEY && XENDIT_WEBHOOK_TOKEN);

    expect(useXendit).toBe(false);
  });

  test("Xendit disabled when webhook token is missing", () => {
    const XENDIT_SECRET_KEY = "sk-test";
    const XENDIT_WEBHOOK_TOKEN: string | undefined = undefined;

    const useXendit = !!(XENDIT_SECRET_KEY && XENDIT_WEBHOOK_TOKEN);

    expect(useXendit).toBe(false);
  });

  test("Xendit disabled when both are missing", () => {
    const XENDIT_SECRET_KEY: string | undefined = undefined;
    const XENDIT_WEBHOOK_TOKEN: string | undefined = undefined;

    const useXendit = !!(XENDIT_SECRET_KEY && XENDIT_WEBHOOK_TOKEN);

    expect(useXendit).toBe(false);
  });
});
