import { describe, test, expect, beforeAll } from "bun:test";
import { db } from "@cogito-app/db";
import { setAuthEmailSender } from "@cogito-app/auth";
import { user } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@cogito-app/auth";

import { resetDatabase } from "../helpers/test-client";

type SentResetEmail = { userId: string; url: string; token: string };

describe("Forgot password flow", () => {
  const sentEmails: SentResetEmail[] = [];

  beforeAll(async () => {
    await resetDatabase();
    sentEmails.length = 0;
    setAuthEmailSender(async ({ user, url, token }) => {
      sentEmails.push({ userId: user.id, url, token });
    });
  });

  const ts = Date.now();
  const email = `reset.${ts}@cogito.test`;
  const password = "OldPassword123!";
  const newPassword = "NewPassword123!";

  async function requestReset(targetEmail: string) {
    const response = await auth.api.requestPasswordReset({
      body: {
        email: targetEmail,
        redirectTo: "http://localhost:3000/reset-password",
      },
      headers: new Headers(),
      asResponse: true,
    });
    return response;
  }

  function tokenFromUrl(url: string): string {
    const match = url.match(/\/reset-password\/([^?]+)/);
    if (!match) throw new Error(`No token in url: ${url}`);
    return match[1]!;
  }

  test("request-password-reset sends reset email with token url", async () => {
    await auth.api.signUpEmail({
      body: { email, password, name: "Reset Tester" },
      headers: new Headers(),
    });

    const response = await requestReset(email);
    expect(response.status).toBe(200);

    expect(sentEmails).toHaveLength(1);
    const sent = sentEmails[0]!;
    expect(sent.url).toContain("/reset-password/");
    expect(sent.url).toContain("callbackURL=");
    expect(tokenFromUrl(sent.url)).toHaveLength(24);
  });

  test("unknown email returns the same success response (no enumeration)", async () => {
    const response = await requestReset(`nobody.${ts}@cogito.test`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      await (await requestReset(email)).text(),
    );
  });

  test("reset-password with valid token changes password", async () => {
    const token = tokenFromUrl(sentEmails[0]!.url);
    const response = await auth.api.resetPassword({
      body: { newPassword, token },
      headers: new Headers(),
      asResponse: true,
    });
    expect(response.status).toBe(200);

    const oldSignIn = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers(),
      asResponse: true,
    });
    expect(oldSignIn.status).toBe(401);

    const newSignIn = await auth.api.signInEmail({
      body: { email, password: newPassword },
      headers: new Headers(),
      asResponse: true,
    });
    expect(newSignIn.status).toBe(200);
  });

  test("used token cannot be replayed", async () => {
    const token = tokenFromUrl(sentEmails[0]!.url);
    const response = await auth.api.resetPassword({
      body: { newPassword: "AnotherPass123!", token },
      headers: new Headers(),
      asResponse: true,
    });
    expect(response.status).toBe(400);
  });

  test("existing sessions are revoked on password reset", async () => {
    await auth.api.signUpEmail({
      body: {
        email: `sessions.${ts}@cogito.test`,
        password,
        name: "Session Tester",
      },
      headers: new Headers(),
    });

    const signIn = await auth.api.signInEmail({
      body: { email: `sessions.${ts}@cogito.test`, password },
      headers: new Headers(),
      asResponse: true,
    });
    const setCookie = signIn.headers.getSetCookie();
    const sessionCookie = setCookie.find((c: string) =>
      c.includes("better-auth.session_token"),
    );
    expect(sessionCookie).toBeDefined();

    const active = await auth.api.getSession({
      headers: new Headers({
        cookie: sessionCookie!.split(";")[0]!,
      }),
    });
    expect(active?.user.email).toBe(`sessions.${ts}@cogito.test`);

    await requestReset(`sessions.${ts}@cogito.test`);
    const resetEmail = sentEmails.at(-1)!;
    await auth.api.resetPassword({
      body: {
        newPassword,
        token: tokenFromUrl(resetEmail.url),
      },
      headers: new Headers(),
    });

    const afterReset = await auth.api.getSession({
      headers: new Headers({
        cookie: sessionCookie!.split(";")[0]!,
      }),
    });
    expect(afterReset).toBeNull();
  });

  test("reset token is bound to the requesting user", async () => {
    const dbUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    expect(dbUser).toBeDefined();

    await requestReset(email);
    const token = tokenFromUrl(sentEmails.at(-1)!.url);

    const record = await db.query.verification.findFirst({
      where: (v, { eq: eqFn }) => eqFn(v.identifier, `reset-password:${token}`),
    });
    expect(record?.value).toBe(dbUser!.id);
  });
});
