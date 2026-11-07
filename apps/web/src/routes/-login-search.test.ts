import { describe, expect, test } from "bun:test";

import { validateLoginSearch } from "./-login-search";

describe("validateLoginSearch", () => {
  test("keeps valid redirect and auth outcome", () => {
    expect(
      validateLoginSearch({
        authOutcome: "created",
        redirect: "/bookings/new",
      }),
    ).toEqual({ authOutcome: "created", redirect: "/bookings/new" });
  });

  test("drops unknown auth outcomes and unsafe redirects", () => {
    expect(
      validateLoginSearch({
        authOutcome: "forged",
        redirect: "//attacker.example",
      }),
    ).toEqual({});
  });
});

test("preserves Google signup rejection with a safe destination", () => {
  expect(
    validateLoginSearch({ error: "signup_disabled", redirect: "/classes" }),
  ).toEqual({ error: "signup_disabled", redirect: "/classes" });
  expect(
    validateLoginSearch({
      error: "signup_disabled",
      redirect: "//evil.example",
    }),
  ).toEqual({ error: "signup_disabled" });
  expect(validateLoginSearch({ error: "untrusted" })).toEqual({});
});
