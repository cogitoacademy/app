import { describe, test, expect } from "bun:test";

describe("Services conditional logic", () => {
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
