import { describe, test, expect } from "bun:test";
import {
  createProviderRefundDelegate,
  resolveGoogleMeetConfig,
  resolveMidtransConfig,
  services,
} from "../../services";
import { env } from "@cogito-app/env/server";

describe("Services conditional logic", () => {
  test("test meeting wiring refuses cancellation of a real provider event", async () => {
    await expect(
      services.meeting.cancelAcademyClassEvent!(
        "test-class-event-owned",
        "owned",
      ),
    ).resolves.toBeUndefined();
    await expect(
      services.meeting.cancelAcademyClassEvent!(null, "owned"),
    ).resolves.toBeUndefined();
    await expect(
      services.meeting.cancelAcademyClassEvent!("real-provider-event", "owned"),
    ).rejects.toThrow("Refusing non-synthetic class event");
  });

  test("content wiring enforces activation and rejects public/private storage overlap before writes", async () => {
    const original = {
      CONTENT_ADMIN_ENABLED: env.CONTENT_ADMIN_ENABLED,
      KB_PRIVATE_DIR: env.KB_PRIVATE_DIR,
      KB_PRIVATE_BUCKET: env.KB_PRIVATE_BUCKET,
    };
    try {
      Object.assign(env, { CONTENT_ADMIN_ENABLED: false });
      await expect(services.contentAdmin.categories()).rejects.toThrow(
        "authoring is not activated",
      );
      Object.assign(env, {
        CONTENT_ADMIN_ENABLED: true,
        KB_PRIVATE_BUCKET: undefined,
        KB_PRIVATE_DIR: env.UPLOAD_DIR,
      });
      await expect(
        services.contentAdmin.uploadPdf({
          fileName: "private.pdf",
          base64: Buffer.from("%PDF-test").toString("base64"),
        }),
      ).rejects.toThrow(
        "KB private directory must be separate from public uploads",
      );
    } finally {
      Object.assign(env, original);
    }
  });
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

test("service-account configuration defaults the primary calendar", () => {
  expect(
    resolveGoogleMeetConfig({
      clientEmail: "service@example.test",
      privateKey: "key",
    }),
  ).toMatchObject({
    calendarId: "primary",
    sendUpdates: "none",
  });
});

test("production service wiring tolerates enabled Meet without credentials", async () => {
  const keys = [
    "NODE_ENV",
    "GOOGLE_MEET_ENABLED",
    "GOOGLE_MEET_CLIENT_ID",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_MEET_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_MEET_REFRESH_TOKEN",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
  ] as const;
  const original = Object.fromEntries(keys.map((key) => [key, env[key]]));
  try {
    Object.assign(
      env,
      Object.fromEntries(keys.map((key) => [key, undefined])),
      { NODE_ENV: "production", GOOGLE_MEET_ENABLED: true },
    );
    const fresh = await import("../../services?production-no-meet-credentials");
    expect(fresh.services.meeting).toBeDefined();
    expect(fresh.resolveGoogleMeetConfig({})).toBeUndefined();
  } finally {
    Object.assign(env, original);
  }
});
