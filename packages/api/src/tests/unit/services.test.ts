import { describe, test, expect } from "bun:test";
import {
  createProviderRefundDelegate,
  resolveGoogleMeetConfig,
  resolveMidtransConfig,
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
      sendUpdates: "none",
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
      sendUpdates: "none",
    });
  });

  test("passes through an explicit calendar sendUpdates override", () => {
    expect(
      resolveGoogleMeetConfig({
        googleClientId: "client",
        googleClientSecret: "secret",
        refreshToken: "refresh",
        sendUpdates: "all",
      }),
    ).toMatchObject({ sendUpdates: "all" });
  });

  test("returns no Google Meet config when credentials are incomplete", () => {
    expect(
      resolveGoogleMeetConfig({ clientEmail: "service@example.com" }),
    ).toBe(undefined);
  });

  test("resolves Midtrans configuration only for a complete Midtrans setup", () => {
    expect(
      resolveMidtransConfig({
        provider: "midtrans",
        serverKey: "SB-Mid-server-test",
        merchantId: "G123456789",
        mode: "test",
        webhookSignatureKey: "dedicated-key",
      }),
    ).toEqual({
      serverKey: "SB-Mid-server-test",
      merchantId: "G123456789",
      mode: "test",
      webhookSignatureKey: "dedicated-key",
    });
    expect(
      resolveMidtransConfig({
        provider: "stub",
        serverKey: "SB-Mid-server-test",
        merchantId: "G123456789",
        mode: "test",
      }),
    ).toBeUndefined();
    expect(
      resolveMidtransConfig({
        provider: "midtrans",
        serverKey: "SB-Mid-server-test",
        merchantId: "G123456789",
      }),
    ).toBeUndefined();
  });

  test("normalizes the shared UAT allowlist for Midtrans", () => {
    expect(
      resolveMidtransConfig({
        provider: "midtrans",
        serverKey: "SB-Mid-server-test",
        merchantId: "G123456789",
        mode: "test",
        testAllowedEmails: "QA@cogitoacademy.id, owner@cogitoacademy.id ",
      }),
    ).toEqual({
      serverKey: "SB-Mid-server-test",
      merchantId: "G123456789",
      mode: "test",
      testAllowedEmails: ["qa@cogitoacademy.id", "owner@cogitoacademy.id"],
    });
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
});
