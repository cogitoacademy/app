import { expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { auth } from "./index";

test("installed Google callback marks new student pending and preserves existing account", async () => {
  const store = { user: [], account: [], session: [], verification: [] };
  const seen: Array<{ path: unknown; role: unknown }> = [];
  const original = auth.options.databaseHooks!.user!.create!.before!;
  const isolated = betterAuth({
    ...auth.options,
    baseURL: "http://localhost:3321",
    database: memoryAdapter(store),
    secondaryStorage: undefined,
    socialProviders: {
      google: { clientId: "synthetic", clientSecret: "synthetic" },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            seen.push({ path: ctx?.path, role: (user as any).role });
            return original(user, ctx);
          },
        },
      },
    },
  });
  const context = await isolated.$context;
  const google = context.socialProviders.find(
    (provider) => provider.id === "google",
  );
  if (!google) throw new Error("missing synthetic provider");
  google.validateAuthorizationCode = async () => ({ accessToken: "synthetic" });
  google.getUserInfo = async () => ({
    user: {
      id: "google-new",
      name: "New student",
      email: "new@example.test",
      emailVerified: true,
    },
    data: {},
  });
  async function callback() {
    const start = await isolated.handler(
      new Request("http://localhost:3321/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3320",
        },
        body: JSON.stringify({
          provider: "google",
          callbackURL:
            "http://localhost:3320/auth/callback?redirect=%2Fprofile",
        }),
      }),
    );
    const body = (await start.json()) as { url: string };
    const state = new URL(body.url).searchParams.get("state");
    const cookie = start.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return isolated.handler(
      new Request(
        `http://localhost:3321/api/auth/callback/google?code=synthetic&state=${state}`,
        { headers: { cookie } },
      ),
    );
  }
  const response = await callback();
  expect(response.status).toBe(302);
  expect(seen).toHaveLength(1);
  expect(seen[0]).toEqual({ path: "/callback/:id", role: undefined });
  expect((store.user[0] as any).referralChoicePending).toBe(true);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  async function freshSession() {
    const result = await isolated.handler(
      new Request(
        "http://localhost:3321/api/auth/get-session?disableCookieCache=true",
        { headers: { cookie } },
      ),
    );
    return (await result.json()) as {
      user: { role: string; referralChoicePending: boolean };
    };
  }
  expect((await freshSession()).user).toMatchObject({
    role: "student",
    referralChoicePending: true,
  });
  (store.user[0] as any).referralChoicePending = false;
  expect((await freshSession()).user.referralChoicePending).toBe(false);
  await callback();
  expect(seen).toHaveLength(1);
  expect((store.user[0] as any).referralChoicePending).toBe(false);
});
