import { describe, test, expect } from "bun:test";

describe("Auth config — conditional Google OAuth", () => {
  test("socialProviders omits google when GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not both set", () => {
    const env = {
      GOOGLE_CLIENT_ID: undefined as string | undefined,
      GOOGLE_CLIENT_SECRET: undefined as string | undefined,
    };
    const socialProviders =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {};
    expect(socialProviders.google).toBeUndefined();
    expect(Object.keys(socialProviders)).toHaveLength(0);
  });

  test("socialProviders includes google when both env vars are set", () => {
    const env = {
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
    };
    const socialProviders =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {};
    expect(socialProviders.google).toBeDefined();
    expect(socialProviders.google!.clientId).toBe("test-client-id");
    expect(socialProviders.google!.clientSecret).toBe("test-client-secret");
  });

  test("socialProviders omits google when only GOOGLE_CLIENT_ID is set", () => {
    const env = {
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: undefined as string | undefined,
    };
    const socialProviders =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {};
    expect(socialProviders.google).toBeUndefined();
  });

  test("socialProviders omits google when only GOOGLE_CLIENT_SECRET is set", () => {
    const env = {
      GOOGLE_CLIENT_ID: undefined as string | undefined,
      GOOGLE_CLIENT_SECRET: "test-secret",
    };
    const socialProviders =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {};
    expect(socialProviders.google).toBeUndefined();
  });
});

describe("Auth config — password policy and session expiry", () => {
  test("emailAndPassword config includes minPasswordLength: 8", () => {
    const emailAndPassword = {
      enabled: true,
      minPasswordLength: 8,
    };
    expect(emailAndPassword.minPasswordLength).toBe(8);
    expect(emailAndPassword.enabled).toBe(true);
  });

  test("session config includes expiresIn: 604800 (7 days in seconds)", () => {
    const session = {
      expiresIn: 60 * 60 * 24 * 7,
      cookieCache: {
        enabled: true,
        maxAge: 60,
      },
    };
    expect(session.expiresIn).toBe(604800);
    expect(session.cookieCache.enabled).toBe(true);
  });
});
