import { expect, test } from "bun:test";
import { refreshSessionResponse } from "./session-response";

test("Redis-cached pending user is refreshed without dropping auth cookies", async () => {
  const response = new Response(
    JSON.stringify({
      user: { id: "student", emailVerified: true, referralChoicePending: true },
      session: { id: "session" },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "session=opaque; HttpOnly",
        "Content-Length": "999",
      },
    },
  );
  const actual = await refreshSessionResponse(response, async (user) => {
    Object.assign(user, { referralChoicePending: false });
  });
  const payload = (await actual.json()) as {
    user: { referralChoicePending: boolean };
  };
  expect(payload.user.referralChoicePending).toBe(false);
  expect(actual.headers.get("set-cookie")).toBe("session=opaque; HttpOnly");
  expect(actual.headers.get("content-length")).toBeNull();
  expect(actual.headers.get("cache-control")).toBe("private, no-store");
});

test("anonymous session is preserved", async () => {
  const response = new Response("null");
  expect(
    await refreshSessionResponse(response, async () => {
      throw Error("Must not refresh anonymous user");
    }),
  ).toBe(response);
});
